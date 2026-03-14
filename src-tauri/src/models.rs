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
            network_enabled: true,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn bot_profile_new_defaults() {
        let bot = BotProfile::new("TestBot".into(), None);
        assert_eq!(bot.name, "TestBot");
        assert_eq!(bot.image, "ghcr.io/openclaw/openclaw:latest");
        assert!(bot.network_enabled);
        assert!(bot.env_vars.is_empty());
        assert!(bot.workspace_path.is_none());
        assert!(bot.api_key_env.is_none());
        assert!(!bot.id.is_empty());
    }

    #[test]
    fn container_name_format() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.id = "abc-123".to_string();
        assert_eq!(bot.container_name(), "clawbox-abc-123");
    }

    #[test]
    fn migrate_moves_api_key_to_env_vars() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.api_key_env = Some("MY_KEY=secret123".to_string());

        bot.migrate();

        assert!(bot.api_key_env.is_none());
        assert_eq!(bot.env_vars.len(), 1);
        assert_eq!(bot.env_vars[0].key, "MY_KEY");
        assert_eq!(bot.env_vars[0].value, "secret123");
    }

    #[test]
    fn migrate_skips_duplicate() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.env_vars.push(EnvVar {
            key: "MY_KEY".to_string(),
            value: "existing".to_string(),
        });
        bot.api_key_env = Some("MY_KEY=new_value".to_string());

        bot.migrate();

        assert_eq!(bot.env_vars.len(), 1);
        assert_eq!(bot.env_vars[0].value, "existing");
    }

    #[test]
    fn migrate_noop_without_api_key() {
        let mut bot = BotProfile::new("Test".into(), None);
        let env_count_before = bot.env_vars.len();

        bot.migrate();

        assert_eq!(bot.env_vars.len(), env_count_before);
    }

    #[test]
    fn bot_status_tagged_serialization() {
        let running = serde_json::to_value(BotStatus::Running).unwrap();
        assert_eq!(running["type"], "Running");

        let stopped = serde_json::to_value(BotStatus::Stopped).unwrap();
        assert_eq!(stopped["type"], "Stopped");

        let error = serde_json::to_value(BotStatus::Error("oops".into())).unwrap();
        assert_eq!(error["type"], "Error");
        assert_eq!(error["message"], "oops");
    }

    #[test]
    fn bot_with_status_flattened() {
        let bot = BotProfile::new("FlatTest".into(), None);
        let bws = BotWithStatus {
            profile: bot,
            status: BotStatus::Running,
        };

        let json = serde_json::to_value(&bws).unwrap();
        // Flattened: profile fields are at the top level
        assert_eq!(json["name"], "FlatTest");
        assert_eq!(json["status"]["type"], "Running");
    }

    #[test]
    fn bot_profile_roundtrip() {
        let original = BotProfile::new("Roundtrip".into(), Some("/tmp/ws".into()));
        let json = serde_json::to_string(&original).unwrap();
        let restored: BotProfile = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.id, original.id);
        assert_eq!(restored.name, "Roundtrip");
        assert_eq!(restored.workspace_path, Some("/tmp/ws".to_string()));
        assert_eq!(restored.image, original.image);
    }
}
