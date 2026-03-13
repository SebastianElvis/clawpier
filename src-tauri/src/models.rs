use serde::{Deserialize, Serialize};

// ── Environment variable key-value pair ──────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

// ── Bot profile (persisted to bots.json) ─────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BotProfile {
    pub id: String,
    pub name: String,
    pub image: String,
    pub network_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    /// Migrated: old field kept for backward-compat deserialization only.
    /// New bots use `env_vars` instead.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub api_key_env: Option<String>,
    /// Environment variables injected into the container on start.
    #[serde(default)]
    pub env_vars: Vec<EnvVar>,
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
            env_vars: Vec::new(),
        }
    }

    pub fn container_name(&self) -> String {
        format!("clawbox-{}", self.id)
    }

    /// Migrate legacy `api_key_env` into `env_vars` if present.
    pub fn migrate(&mut self) {
        if let Some(ref api_key) = self.api_key_env.take() {
            // api_key_env was stored as "KEY=VALUE"
            if let Some((key, value)) = api_key.split_once('=') {
                // Only add if not already present
                if !self.env_vars.iter().any(|e| e.key == key) {
                    self.env_vars.push(EnvVar {
                        key: key.to_string(),
                        value: value.to_string(),
                    });
                }
            }
        }
    }
}

// ── Bot status (from Docker inspection) ──────────────────────────────
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

// ── Container stats (emitted via events) ─────────────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_usage: u64,
    pub memory_limit: u64,
    pub memory_percent: f64,
    pub network_rx: u64,
    pub network_tx: u64,
}

// ── Log entry (emitted via events) ───────────────────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct LogEntry {
    pub timestamp: Option<String>,
    pub message: String,
    pub stream: String, // "stdout" or "stderr"
}

// ── Exec result (returned from exec_command) ─────────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct ExecResult {
    pub output: String,
    pub exit_code: Option<i64>,
}

// ── File entry (returned from list_workspace_files) ──────────────────
#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}
