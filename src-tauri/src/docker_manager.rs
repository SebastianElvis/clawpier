use std::collections::HashMap;

use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions, LogsOptions, RemoveContainerOptions,
    StartContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::CreateImageOptions;
use bollard::image::ListImagesOptions;
use bollard::models::HostConfig;
use bollard::Docker;
use futures_util::StreamExt;

use crate::error::AppError;
use crate::models::{BotProfile, BotStatus, ContainerStats, ExecResult, LogEntry};

pub struct DockerManager {
    docker: Docker,
}

impl DockerManager {
    pub fn new() -> Result<Self, AppError> {
        let docker = Docker::connect_with_socket_defaults()
            .map_err(|e| AppError::DockerUnavailable(e.to_string()))?;
        Ok(Self { docker })
    }

    /// Clone the inner Docker client for use in spawned tasks.
    /// This is cheap — bollard's Docker uses Arc internally.
    pub fn client(&self) -> Docker {
        self.docker.clone()
    }

    pub async fn check_docker(&self) -> Result<bool, AppError> {
        self.docker.ping().await?;
        Ok(true)
    }

    pub async fn check_image(&self, image: &str) -> Result<bool, AppError> {
        let search = if image.contains(':') {
            image.to_string()
        } else {
            format!("{}:latest", image)
        };

        let options = ListImagesOptions::<String> {
            all: false,
            ..Default::default()
        };

        let images = self.docker.list_images(Some(options)).await?;

        let found = images
            .iter()
            .any(|img| img.repo_tags.iter().any(|tag| tag == &search));

        Ok(found)
    }

    pub async fn get_container_status(&self, bot_id: &str) -> BotStatus {
        let container_name = format!("clawbox-{}", bot_id);

        let mut filters = HashMap::new();
        filters.insert("name".to_string(), vec![container_name.clone()]);

        let options = ListContainersOptions {
            all: true,
            filters,
            ..Default::default()
        };

        match self.docker.list_containers(Some(options)).await {
            Ok(containers) => {
                let container = containers.iter().find(|c| {
                    c.names.as_ref().is_some_and(|names| {
                        names.iter().any(|n| n == &format!("/{}", container_name))
                    })
                });

                match container {
                    Some(c) => match &c.state {
                        Some(state) if state == "running" => BotStatus::Running,
                        Some(state) if state == "exited" || state == "dead" => BotStatus::Stopped,
                        Some(state) => BotStatus::Error(format!("Unexpected state: {}", state)),
                        None => BotStatus::Stopped,
                    },
                    None => BotStatus::Stopped,
                }
            }
            Err(e) => BotStatus::Error(e.to_string()),
        }
    }

    pub async fn get_all_statuses(&self, bot_ids: &[String]) -> HashMap<String, BotStatus> {
        let mut statuses = HashMap::new();
        for id in bot_ids {
            let status = self.get_container_status(id).await;
            statuses.insert(id.clone(), status);
        }
        statuses
    }

    pub async fn start_bot(&self, profile: &BotProfile) -> Result<(), AppError> {
        let container_name = profile.container_name();

        // Remove existing container if any
        let _ = self.remove_container(&profile.id).await;

        // Build environment variables — always inject gateway host
        let mut env = vec!["OPENCLAW_GATEWAY_HOST=127.0.0.1".to_string()];

        // Add user-configured env vars
        for ev in &profile.env_vars {
            env.push(format!("{}={}", ev.key, ev.value));
        }

        // Legacy fallback
        if let Some(ref api_key_env) = profile.api_key_env {
            env.push(api_key_env.clone());
        }

        // Build volume binds
        let mut binds = Vec::new();
        if let Some(ref workspace) = profile.workspace_path {
            binds.push(format!("{}:/workspace:rw", workspace));
        }

        // Host config
        let host_config = HostConfig {
            network_mode: if profile.network_enabled {
                Some("bridge".to_string())
            } else {
                Some("none".to_string())
            },
            binds: if binds.is_empty() {
                None
            } else {
                Some(binds)
            },
            ..Default::default()
        };

        let config = Config {
            image: Some(profile.image.clone()),
            env: Some(env.clone()),
            host_config: Some(host_config),
            ..Default::default()
        };

        let options = CreateContainerOptions {
            name: &container_name,
            platform: None,
        };

        self.docker
            .create_container(Some(options), config)
            .await?;

        self.docker
            .start_container(&container_name, None::<StartContainerOptions<String>>)
            .await?;

        Ok(())
    }

    pub async fn stop_bot(&self, bot_id: &str) -> Result<(), AppError> {
        let container_name = format!("clawbox-{}", bot_id);

        let options = StopContainerOptions { t: 10 };

        match self
            .docker
            .stop_container(&container_name, Some(options))
            .await
        {
            Ok(_) => {}
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 304, ..
            }) => {}
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => {
                return Ok(());
            }
            Err(e) => return Err(e.into()),
        }

        self.remove_container(bot_id).await?;
        Ok(())
    }

    pub async fn remove_container(&self, bot_id: &str) -> Result<(), AppError> {
        let container_name = format!("clawbox-{}", bot_id);

        let options = RemoveContainerOptions {
            force: true,
            ..Default::default()
        };

        match self
            .docker
            .remove_container(&container_name, Some(options))
            .await
        {
            Ok(_) => Ok(()),
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn pull_image(&self, image: &str) -> Result<(), AppError> {
        let options = CreateImageOptions {
            from_image: image,
            ..Default::default()
        };

        let mut stream = self.docker.create_image(Some(options), None, None);

        while let Some(result) = stream.next().await {
            match result {
                Ok(_info) => {}
                Err(e) => return Err(e.into()),
            }
        }

        Ok(())
    }

    // ── Run a command inside a running container ─────────────────────
    pub async fn exec_in_container(
        docker: &Docker,
        container_name: &str,
        command: &str,
    ) -> Result<ExecResult, AppError> {
        let config = CreateExecOptions {
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            cmd: Some(vec!["sh", "-c", command]),
            ..Default::default()
        };

        let created = docker.create_exec(container_name, config).await?;

        let mut output = String::new();

        if let StartExecResults::Attached {
            output: mut out_stream, ..
        } = docker.start_exec(&created.id, None).await?
        {
            use bollard::container::LogOutput;
            while let Some(Ok(msg)) = out_stream.next().await {
                match msg {
                    LogOutput::StdOut { message } => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    LogOutput::StdErr { message } => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    _ => {}
                }
            }
        }

        // Get exit code
        let inspect = docker.inspect_exec(&created.id).await?;
        let exit_code = inspect.exit_code;

        Ok(ExecResult { output, exit_code })
    }

    // ── Parse a Docker stats response into our ContainerStats ────────
    pub fn parse_stats(stats: &bollard::container::Stats) -> ContainerStats {
        // CPU calculation
        let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64
            - stats.precpu_stats.cpu_usage.total_usage as f64;
        let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
            - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;
        let num_cpus = stats
            .cpu_stats
            .cpu_usage
            .percpu_usage
            .as_ref()
            .map(|v| v.len())
            .unwrap_or(1) as f64;

        let cpu_percent = if system_delta > 0.0 {
            (cpu_delta / system_delta) * num_cpus * 100.0
        } else {
            0.0
        };

        // Memory
        let memory_usage = stats.memory_stats.usage.unwrap_or(0);
        let memory_limit = stats.memory_stats.limit.unwrap_or(1);
        let memory_percent = if memory_limit > 0 {
            (memory_usage as f64 / memory_limit as f64) * 100.0
        } else {
            0.0
        };

        // Network
        let (network_rx, network_tx) = stats
            .networks
            .as_ref()
            .map(|nets| {
                nets.values().fold((0u64, 0u64), |(rx, tx), net| {
                    (rx + net.rx_bytes, tx + net.tx_bytes)
                })
            })
            .unwrap_or((0, 0));

        ContainerStats {
            cpu_percent,
            memory_usage,
            memory_limit,
            memory_percent,
            network_rx,
            network_tx,
        }
    }

    // ── Parse a log output into LogEntry ─────────────────────────────
    pub fn parse_log_output(output: &bollard::container::LogOutput) -> LogEntry {
        match output {
            bollard::container::LogOutput::StdOut { message } => {
                let text = String::from_utf8_lossy(message).to_string();
                let (timestamp, message) = Self::split_timestamp(&text);
                LogEntry {
                    timestamp,
                    message,
                    stream: "stdout".to_string(),
                }
            }
            bollard::container::LogOutput::StdErr { message } => {
                let text = String::from_utf8_lossy(message).to_string();
                let (timestamp, message) = Self::split_timestamp(&text);
                LogEntry {
                    timestamp,
                    message,
                    stream: "stderr".to_string(),
                }
            }
            _ => LogEntry {
                timestamp: None,
                message: String::new(),
                stream: "stdout".to_string(),
            },
        }
    }

    /// Split a Docker log line with timestamps into (timestamp, message).
    fn split_timestamp(text: &str) -> (Option<String>, String) {
        if text.len() > 31 && text.as_bytes()[0].is_ascii_digit() {
            if let Some(space_idx) = text[..35].find(' ') {
                let ts = text[..space_idx].to_string();
                let msg = text[space_idx + 1..].to_string();
                return (Some(ts), msg);
            }
        }
        (None, text.to_string())
    }
}

// ── Helper: create log stream options ────────────────────────────────
pub fn log_options(tail: Option<u64>) -> LogsOptions<String> {
    LogsOptions {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: tail
            .map(|t| t.to_string())
            .unwrap_or_else(|| "100".to_string()),
        ..Default::default()
    }
}

// ── Helper: create stats stream options ──────────────────────────────
pub fn stats_options() -> StatsOptions {
    StatsOptions {
        stream: true,
        one_shot: false,
    }
}
