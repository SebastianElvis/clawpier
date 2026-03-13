use std::collections::HashMap;

use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions, RemoveContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::models::HostConfig;
use bollard::Docker;
use bollard::image::ListImagesOptions;
use futures_util::StreamExt;

use crate::error::AppError;
use crate::models::{BotProfile, BotStatus};

pub struct DockerManager {
    docker: Docker,
}

impl DockerManager {
    pub fn new() -> Result<Self, AppError> {
        let docker = Docker::connect_with_socket_defaults()
            .map_err(|e| AppError::DockerUnavailable(e.to_string()))?;
        Ok(Self { docker })
    }

    pub async fn check_docker(&self) -> Result<bool, AppError> {
        self.docker.ping().await?;
        Ok(true)
    }

    pub async fn check_image(&self, image: &str) -> Result<bool, AppError> {
        // Parse image name to match against repo tags
        // Docker stores tags as "repo:tag" in RepoTags
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

        let found = images.iter().any(|img| {
            img.repo_tags
                .iter()
                .any(|tag| tag == &search)
        });

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
                // Find exact match (Docker name matching includes partial matches)
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

        // Build environment variables
        let mut env = vec!["OPENCLAW_GATEWAY_HOST=127.0.0.1".to_string()];
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

        // Stop with 10 second timeout
        let options = StopContainerOptions { t: 10 };

        match self.docker.stop_container(&container_name, Some(options)).await {
            Ok(_) => {}
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 304, ..
            }) => {
                // Already stopped
            }
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => {
                // Container doesn't exist
                return Ok(());
            }
            Err(e) => return Err(e.into()),
        }

        // Remove container after stopping
        self.remove_container(bot_id).await?;

        Ok(())
    }

    pub async fn remove_container(&self, bot_id: &str) -> Result<(), AppError> {
        let container_name = format!("clawbox-{}", bot_id);

        let options = RemoveContainerOptions {
            force: true,
            ..Default::default()
        };

        match self.docker.remove_container(&container_name, Some(options)).await {
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
                Ok(_info) => {
                    // Progress info available but not surfaced in MVP
                }
                Err(e) => return Err(e.into()),
            }
        }

        Ok(())
    }
}
