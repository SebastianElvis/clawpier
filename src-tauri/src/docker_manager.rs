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

use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{BotProfile, BotStatus, ContainerStats, ExecResult, LogEntry, NetworkMode};

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
        let container_name = format!("clawpier-{}", bot_id);

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

        // Create a host directory for persisting OpenClaw config across restarts.
        // Using a host bind mount (not a named volume) so it inherits the correct
        // user permissions — named volumes are root-owned and cause EACCES for the
        // container's `node` user.
        let bot_config_dir = config_dir_for_bot(&profile.id)?;
        let binds = build_binds(profile, &bot_config_dir);

        // Network mode
        let network_mode_str = match &profile.network_mode {
            NetworkMode::None => "none".to_string(),
            NetworkMode::Bridge => "bridge".to_string(),
            NetworkMode::Host => "host".to_string(),
            NetworkMode::Custom(name) => name.clone(),
        };

        // Port bindings
        let (port_bindings, exposed_ports) = build_port_config(&profile.port_mappings);

        // Host config
        let host_config = HostConfig {
            network_mode: Some(network_mode_str),
            binds: Some(binds),
            nano_cpus: profile.cpu_limit.map(|c| (c * 1_000_000_000.0) as i64),
            memory: profile.memory_limit.map(|m| m as i64),
            port_bindings: if port_bindings.is_empty() {
                None
            } else {
                Some(port_bindings)
            },
            ..Default::default()
        };

        let config = Config {
            image: Some(profile.image.clone()),
            env: Some(env.clone()),
            host_config: Some(host_config),
            exposed_ports: if exposed_ports.is_empty() {
                None
            } else {
                Some(exposed_ports)
            },
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
        let container_name = format!("clawpier-{}", bot_id);

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
        let container_name = format!("clawpier-{}", bot_id);

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
        // Prefer online_cpus (newer Docker API), fall back to percpu_usage count
        let num_cpus = stats
            .cpu_stats
            .online_cpus
            .filter(|&n| n > 0)
            .unwrap_or_else(|| {
                stats
                    .cpu_stats
                    .cpu_usage
                    .percpu_usage
                    .as_ref()
                    .map(|v| v.len() as u64)
                    .unwrap_or(1)
            });
        let num_cpus_f64 = num_cpus as f64;

        let cpu_percent = if system_delta > 0.0 {
            (cpu_delta / system_delta) * num_cpus_f64 * 100.0
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
            cpu_cores: num_cpus as u32,
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
    /// Docker timestamps are RFC3339 (e.g. `2024-01-15T10:30:45.123456789Z`)
    /// which is typically 30 chars, followed by a space and the log message.
    fn split_timestamp(text: &str) -> (Option<String>, String) {
        // Minimum: 30-char timestamp + space + at least empty message = 31 chars
        if text.len() >= 31 && text.as_bytes()[0].is_ascii_digit() {
            let search_end = text.len().min(40);
            if let Some(space_idx) = text[..search_end].find(' ') {
                let ts = text[..space_idx].to_string();
                let msg = text[space_idx + 1..].to_string();
                return (Some(ts), msg);
            }
        }
        (None, text.to_string())
    }
}

// ── Helper: create and return the host config directory for a bot ─────
fn config_dir_for_bot(bot_id: &str) -> Result<PathBuf, AppError> {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("clawpier")
        .join("data")
        .join(bot_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

// ── Helper: build volume bind mounts for a bot container ─────────────
fn build_binds(profile: &BotProfile, bot_config_dir: &std::path::Path) -> Vec<String> {
    let mut binds = Vec::new();
    if let Some(ref workspace) = profile.workspace_path {
        binds.push(format!("{}:/workspace:rw", workspace));
    }
    // Persist OpenClaw config across container restarts using a host bind mount
    binds.push(format!(
        "{}:/home/node/.openclaw:rw",
        bot_config_dir.display()
    ));
    binds
}

// ── Helper: build Docker port bindings from PortMapping vec ──────────
fn build_port_config(
    mappings: &[crate::models::PortMapping],
) -> (
    HashMap<String, Option<Vec<bollard::models::PortBinding>>>,
    HashMap<String, HashMap<(), ()>>,
) {
    let mut port_bindings = HashMap::new();
    let mut exposed_ports = HashMap::new();

    for m in mappings {
        let container_key = format!("{}/{}", m.container_port, m.protocol);
        let binding = bollard::models::PortBinding {
            host_ip: Some("0.0.0.0".to_string()),
            host_port: Some(m.host_port.to_string()),
        };
        port_bindings
            .entry(container_key.clone())
            .or_insert_with(|| Some(Vec::new()))
            .as_mut()
            .unwrap()
            .push(binding);
        exposed_ports.insert(container_key, HashMap::new());
    }

    (port_bindings, exposed_ports)
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

#[cfg(test)]
mod tests {
    use super::*;
    use bollard::container::LogOutput;
    use bytes::Bytes;

    // ── split_timestamp ──────────────────────────────────────────────

    #[test]
    fn split_timestamp_with_ts() {
        let line = "2024-01-15T10:30:45.123456789Z Hello world";
        let (ts, msg) = DockerManager::split_timestamp(line);
        assert_eq!(ts.unwrap(), "2024-01-15T10:30:45.123456789Z");
        assert_eq!(msg, "Hello world");
    }

    #[test]
    fn split_timestamp_without_ts() {
        let line = "Just a plain message without any timestamp";
        let (ts, msg) = DockerManager::split_timestamp(line);
        assert!(ts.is_none());
        assert_eq!(msg, line);
    }

    #[test]
    fn split_timestamp_short_string() {
        let line = "short";
        let (ts, msg) = DockerManager::split_timestamp(line);
        assert!(ts.is_none());
        assert_eq!(msg, "short");
    }

    #[test]
    fn split_timestamp_empty() {
        let (ts, msg) = DockerManager::split_timestamp("");
        assert!(ts.is_none());
        assert_eq!(msg, "");
    }

    // ── parse_log_output ─────────────────────────────────────────────

    #[test]
    fn parse_log_output_stdout() {
        let output = LogOutput::StdOut {
            message: Bytes::from("2024-01-15T10:30:45.123456789Z server started"),
        };
        let entry = DockerManager::parse_log_output(&output);
        assert_eq!(entry.stream, "stdout");
        assert_eq!(entry.message, "server started");
        assert!(entry.timestamp.is_some());
    }

    #[test]
    fn parse_log_output_stderr() {
        let output = LogOutput::StdErr {
            message: Bytes::from("2024-01-15T10:30:45.123456789Z error occurred"),
        };
        let entry = DockerManager::parse_log_output(&output);
        assert_eq!(entry.stream, "stderr");
        assert_eq!(entry.message, "error occurred");
    }

    #[test]
    fn parse_log_output_no_timestamp() {
        let output = LogOutput::StdOut {
            message: Bytes::from("plain message"),
        };
        let entry = DockerManager::parse_log_output(&output);
        assert!(entry.timestamp.is_none());
        assert_eq!(entry.message, "plain message");
    }

    // ── log_options / stats_options ──────────────────────────────────

    #[test]
    fn log_options_default_tail() {
        let opts = log_options(None);
        assert!(opts.follow);
        assert!(opts.stdout);
        assert!(opts.stderr);
        assert!(opts.timestamps);
        assert_eq!(opts.tail, "100");
    }

    #[test]
    fn log_options_custom_tail() {
        let opts = log_options(Some(500));
        assert_eq!(opts.tail, "500");
    }

    #[test]
    fn stats_options_defaults() {
        let opts = stats_options();
        assert!(opts.stream);
        assert!(!opts.one_shot);
    }

    // ── build_port_config ──────────────────────────────────────────

    #[test]
    fn build_port_config_empty() {
        let (bindings, exposed) = build_port_config(&[]);
        assert!(bindings.is_empty());
        assert!(exposed.is_empty());
    }

    #[test]
    fn build_port_config_single_tcp() {
        use crate::models::PortMapping;
        let mappings = vec![PortMapping {
            container_port: 8080,
            host_port: 9090,
            protocol: "tcp".into(),
        }];
        let (bindings, exposed) = build_port_config(&mappings);

        assert!(bindings.contains_key("8080/tcp"));
        let binding_vec = bindings["8080/tcp"].as_ref().unwrap();
        assert_eq!(binding_vec.len(), 1);
        assert_eq!(binding_vec[0].host_port.as_deref(), Some("9090"));
        assert_eq!(binding_vec[0].host_ip.as_deref(), Some("0.0.0.0"));
        assert!(exposed.contains_key("8080/tcp"));
    }

    #[test]
    fn build_port_config_udp() {
        use crate::models::PortMapping;
        let mappings = vec![PortMapping {
            container_port: 53,
            host_port: 5353,
            protocol: "udp".into(),
        }];
        let (bindings, _exposed) = build_port_config(&mappings);

        assert!(bindings.contains_key("53/udp"));
        assert!(!bindings.contains_key("53/tcp"));
    }

    #[test]
    fn build_port_config_multiple() {
        use crate::models::PortMapping;
        let mappings = vec![
            PortMapping {
                container_port: 80,
                host_port: 8080,
                protocol: "tcp".into(),
            },
            PortMapping {
                container_port: 443,
                host_port: 8443,
                protocol: "tcp".into(),
            },
        ];
        let (bindings, exposed) = build_port_config(&mappings);

        assert_eq!(bindings.len(), 2);
        assert_eq!(exposed.len(), 2);
        assert!(bindings.contains_key("80/tcp"));
        assert!(bindings.contains_key("443/tcp"));
    }

    #[test]
    fn build_port_config_duplicate_container_port() {
        use crate::models::PortMapping;
        // Two mappings for the same container port (e.g., mapping to two host ports)
        let mappings = vec![
            PortMapping {
                container_port: 8080,
                host_port: 9090,
                protocol: "tcp".into(),
            },
            PortMapping {
                container_port: 8080,
                host_port: 9091,
                protocol: "tcp".into(),
            },
        ];
        let (bindings, _exposed) = build_port_config(&mappings);

        // Both should be under the same key
        let binding_vec = bindings["8080/tcp"].as_ref().unwrap();
        assert_eq!(binding_vec.len(), 2);
    }

    #[test]
    fn build_port_config_mixed_protocols() {
        use crate::models::PortMapping;
        let mappings = vec![
            PortMapping {
                container_port: 53,
                host_port: 5353,
                protocol: "tcp".into(),
            },
            PortMapping {
                container_port: 53,
                host_port: 5353,
                protocol: "udp".into(),
            },
        ];
        let (bindings, exposed) = build_port_config(&mappings);

        // Same port but different protocols = different keys
        assert_eq!(bindings.len(), 2);
        assert!(bindings.contains_key("53/tcp"));
        assert!(bindings.contains_key("53/udp"));
        assert_eq!(exposed.len(), 2);
    }

    // ── build_binds ─────────────────────────────────────────────────

    #[test]
    fn build_binds_always_includes_config_dir() {
        let profile = BotProfile::new("test".into(), None);
        let config_dir = std::path::PathBuf::from("/tmp/clawpier-test");
        let binds = build_binds(&profile, &config_dir);
        assert_eq!(binds.len(), 1);
        assert_eq!(binds[0], "/tmp/clawpier-test:/home/node/.openclaw:rw");
    }

    #[test]
    fn build_binds_includes_workspace_when_set() {
        let profile = BotProfile::new("test".into(), Some("/my/workspace".into()));
        let config_dir = std::path::PathBuf::from("/tmp/clawpier-test");
        let binds = build_binds(&profile, &config_dir);
        assert_eq!(binds.len(), 2);
        assert_eq!(binds[0], "/my/workspace:/workspace:rw");
        assert_eq!(binds[1], "/tmp/clawpier-test:/home/node/.openclaw:rw");
    }

    #[test]
    fn config_dir_for_bot_creates_directory() {
        let bot_id = format!("test-{}", uuid::Uuid::new_v4());
        let dir = config_dir_for_bot(&bot_id).expect("should create dir");
        assert!(dir.exists());
        assert!(dir.is_dir());
        // Cleanup
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── Docker integration test ─────────────────────────────────────
    // Verifies that host bind mounts persist data across container
    // recreations. This is the mechanism that keeps openclaw config
    // (Telegram, Kimi, etc.) across restarts triggered by `openclaw configure`.
    //
    // Requires: Docker running, busybox image available.
    // Run with: cargo test --manifest-path src-tauri/Cargo.toml -- --ignored

    #[tokio::test]
    #[ignore]
    async fn config_bind_mount_persists_across_restart() {
        let dm = DockerManager::new().expect("Docker must be running");
        let client = dm.client();

        let test_id = uuid::Uuid::new_v4().to_string();
        let short_id = &test_id[..8];
        let cname = format!("clawpier-inttest-{}", short_id);

        // Use a temp directory as the host bind mount
        let host_dir = std::env::temp_dir().join(format!("clawpier-inttest-{}", short_id));
        std::fs::create_dir_all(&host_dir).expect("create host dir");

        // Cleanup from any previous failed run
        let _ = client
            .remove_container(
                &cname,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;

        let host_dir_str = host_dir.to_string_lossy().to_string();
        let make_config = || Config {
            image: Some("busybox:latest".to_string()),
            cmd: Some(vec!["sleep".to_string(), "300".to_string()]),
            host_config: Some(HostConfig {
                binds: Some(vec![format!("{}:/config:rw", host_dir_str)]),
                ..Default::default()
            }),
            ..Default::default()
        };

        // Step 1: Create container, write test data
        client
            .create_container(
                Some(CreateContainerOptions {
                    name: cname.as_str(),
                    platform: None,
                }),
                make_config(),
            )
            .await
            .expect("create container");
        client
            .start_container(&cname, None::<StartContainerOptions<String>>)
            .await
            .expect("start container");

        let exec = client
            .create_exec(
                &cname,
                CreateExecOptions {
                    cmd: Some(vec![
                        "sh",
                        "-c",
                        "echo 'telegram_token=abc123' > /config/test.txt",
                    ]),
                    ..Default::default()
                },
            )
            .await
            .expect("create write exec");
        client
            .start_exec(&exec.id, None)
            .await
            .expect("start write exec");

        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        // Step 2: Remove container (simulates restart)
        client
            .stop_container(&cname, Some(StopContainerOptions { t: 1 }))
            .await
            .expect("stop");
        client
            .remove_container(
                &cname,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await
            .expect("remove");

        // Step 3: Recreate container with the same bind mount
        client
            .create_container(
                Some(CreateContainerOptions {
                    name: cname.as_str(),
                    platform: None,
                }),
                make_config(),
            )
            .await
            .expect("recreate container");
        client
            .start_container(&cname, None::<StartContainerOptions<String>>)
            .await
            .expect("restart container");

        // Step 4: Read test data back — it must have persisted
        let exec = client
            .create_exec(
                &cname,
                CreateExecOptions {
                    attach_stdout: Some(true),
                    cmd: Some(vec!["cat", "/config/test.txt"]),
                    ..Default::default()
                },
            )
            .await
            .expect("create read exec");

        let mut output = String::new();
        if let StartExecResults::Attached {
            output: mut stream, ..
        } = client
            .start_exec(&exec.id, None)
            .await
            .expect("start read exec")
        {
            while let Some(Ok(msg)) = stream.next().await {
                if let bollard::container::LogOutput::StdOut { message } = msg {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
            }
        }

        assert!(
            output.contains("telegram_token=abc123"),
            "Config data must persist across restarts. Got: '{}'",
            output.trim()
        );

        // Cleanup
        let _ = client
            .stop_container(&cname, Some(StopContainerOptions { t: 1 }))
            .await;
        let _ = client
            .remove_container(
                &cname,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;
        let _ = std::fs::remove_dir_all(&host_dir);
    }

    /// Verifies that a non-root user (UID 1000, like OpenClaw's `node` user)
    /// can write to the bind-mounted config directory.
    ///
    /// This is the exact scenario that caused EACCES with named Docker volumes:
    /// named volumes are root-owned, so the `node` user couldn't write
    /// `openclaw.json`. Host bind mounts don't have this problem because
    /// Docker Desktop maps UIDs via virtiofs.
    #[tokio::test]
    #[ignore]
    async fn bind_mount_writable_by_nonroot_user() {
        let dm = DockerManager::new().expect("Docker must be running");
        let client = dm.client();

        let test_id = uuid::Uuid::new_v4().to_string();
        let short_id = &test_id[..8];
        let cname = format!("clawpier-perm-{}", short_id);

        // Create host directory (same as config_dir_for_bot does)
        let host_dir =
            std::env::temp_dir().join(format!("clawpier-perm-{}", short_id));
        std::fs::create_dir_all(&host_dir).expect("create host dir");

        // On Linux CI (no Docker Desktop/virtiofs), the host dir is owned by
        // the runner user, so UID 1000 inside the container can't write to it.
        // Make it world-writable to match the virtiofs UID-mapping behaviour
        // that Docker Desktop provides on macOS.
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&host_dir, std::fs::Permissions::from_mode(0o777))
                .expect("chmod host dir");
        }

        let _ = client
            .remove_container(
                &cname,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;

        // Run container as non-root user UID 1000 (matches openclaw's `node`)
        let host_dir_str = host_dir.to_string_lossy().to_string();
        let config = Config {
            image: Some("busybox:latest".to_string()),
            cmd: Some(vec!["sleep".to_string(), "300".to_string()]),
            user: Some("1000:1000".to_string()),
            host_config: Some(HostConfig {
                binds: Some(vec![format!(
                    "{}:/home/node/.openclaw:rw",
                    host_dir_str
                )]),
                ..Default::default()
            }),
            ..Default::default()
        };

        client
            .create_container(
                Some(CreateContainerOptions {
                    name: cname.as_str(),
                    platform: None,
                }),
                config,
            )
            .await
            .expect("create container");
        client
            .start_container(&cname, None::<StartContainerOptions<String>>)
            .await
            .expect("start container");

        // Write a config file as the non-root user.
        // With named volumes this would fail: EACCES: permission denied
        let exec = client
            .create_exec(
                &cname,
                CreateExecOptions {
                    attach_stderr: Some(true),
                    cmd: Some(vec![
                        "sh",
                        "-c",
                        "echo '{\"telegram\":{\"token\":\"test123\"}}' > /home/node/.openclaw/openclaw.json",
                    ]),
                    user: Some("1000:1000"),
                    ..Default::default()
                },
            )
            .await
            .expect("create write exec");

        if let StartExecResults::Attached {
            output: mut stream, ..
        } = client
            .start_exec(&exec.id, None)
            .await
            .expect("write exec must not EACCES")
        {
            let mut stderr = String::new();
            while let Some(Ok(msg)) = stream.next().await {
                if let bollard::container::LogOutput::StdErr { message } = msg {
                    stderr.push_str(&String::from_utf8_lossy(&message));
                }
            }
            assert!(
                !stderr.contains("Permission denied") && !stderr.contains("EACCES"),
                "Non-root user must be able to write. Got stderr: '{}'",
                stderr.trim()
            );
        }

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Verify the file is readable from inside the container
        let exec = client
            .create_exec(
                &cname,
                CreateExecOptions {
                    attach_stdout: Some(true),
                    cmd: Some(vec!["cat", "/home/node/.openclaw/openclaw.json"]),
                    user: Some("1000:1000"),
                    ..Default::default()
                },
            )
            .await
            .expect("create read exec");

        let mut output = String::new();
        if let StartExecResults::Attached {
            output: mut stream, ..
        } = client
            .start_exec(&exec.id, None)
            .await
            .expect("start read exec")
        {
            while let Some(Ok(msg)) = stream.next().await {
                if let bollard::container::LogOutput::StdOut { message } = msg {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
            }
        }

        assert!(
            output.contains("telegram"),
            "Non-root user must read back config. Got: '{}'",
            output.trim()
        );

        // Verify the file also exists on the host (bind mount is bidirectional)
        let host_file = host_dir.join("openclaw.json");
        assert!(
            host_file.exists(),
            "File written in container must appear on host"
        );
        let host_content =
            std::fs::read_to_string(&host_file).expect("read host file");
        assert!(
            host_content.contains("telegram"),
            "Host file must contain data written by container"
        );

        // Cleanup
        let _ = client
            .stop_container(&cname, Some(StopContainerOptions { t: 1 }))
            .await;
        let _ = client
            .remove_container(
                &cname,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;
        let _ = std::fs::remove_dir_all(&host_dir);
    }
}
