use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BotProfile {
    pub id: String,
    pub name: String,
    pub image: String,
    pub network_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_env: Option<String>,
}

impl BotProfile {
    pub fn new(name: String, workspace_path: Option<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            image: "ghcr.io/openclaw/openclaw:latest".to_string(),
            network_enabled: false,
            workspace_path,
            api_key_env: None,
        }
    }

    pub fn container_name(&self) -> String {
        format!("clawbox-{}", self.id)
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "message")]
pub enum BotStatus {
    Running,
    Stopped,
    Error(String),
}

#[derive(Debug, Serialize, Clone)]
pub struct BotWithStatus {
    #[serde(flatten)]
    pub profile: BotProfile,
    pub status: BotStatus,
}
