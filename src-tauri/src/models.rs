use serde::{Deserialize, Serialize};

// ── Environment variable key-value pair ──────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

// ── Network mode for containers ──────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NetworkMode {
    None,
    Bridge,
    Host,
    Custom(String),
}

impl Default for NetworkMode {
    fn default() -> Self {
        NetworkMode::Bridge
    }
}

// ── Port mapping (container → host) ─────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortMapping {
    pub container_port: u16,
    pub host_port: u16,
    pub protocol: String, // "tcp" or "udp"
}

// ── Bot profile (persisted to bots.json) ─────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BotProfile {
    pub id: String,
    pub name: String,
    pub image: String,
    /// Legacy field — kept for backward-compat deserialization only.
    /// Migrated to `network_mode` on load.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub network_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    /// Migrated: old field kept for backward-compat deserialization only.
    /// New bots use `env_vars` instead.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub api_key_env: Option<String>,
    /// Environment variables injected into the container on start.
    #[serde(default)]
    pub env_vars: Vec<EnvVar>,
    /// CPU limit in cores (e.g., 0.5, 1.0, 2.0). None = no limit.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cpu_limit: Option<f64>,
    /// Memory limit in bytes. None = no limit.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub memory_limit: Option<u64>,
    /// Network mode for the container.
    #[serde(default)]
    pub network_mode: NetworkMode,
    /// Port mappings (container port → host port).
    #[serde(default)]
    pub port_mappings: Vec<PortMapping>,
}

impl BotProfile {
    pub fn new(name: String, workspace_path: Option<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            image: "ghcr.io/openclaw/openclaw:latest".to_string(),
            network_enabled: None,
            workspace_path,
            api_key_env: None,
            env_vars: Vec::new(),
            cpu_limit: None,
            memory_limit: None,
            network_mode: NetworkMode::Bridge,
            port_mappings: Vec::new(),
        }
    }

    pub fn container_name(&self) -> String {
        format!("clawpier-{}", self.id)
    }

    /// Migrate legacy fields into their modern equivalents.
    pub fn migrate(&mut self) {
        // Migrate api_key_env → env_vars
        if let Some(ref api_key) = self.api_key_env.take() {
            if let Some((key, value)) = api_key.split_once('=') {
                if !self.env_vars.iter().any(|e| e.key == key) {
                    self.env_vars.push(EnvVar {
                        key: key.to_string(),
                        value: value.to_string(),
                    });
                }
            }
        }
        // Migrate network_enabled → network_mode
        if let Some(enabled) = self.network_enabled.take() {
            self.network_mode = if enabled {
                NetworkMode::Bridge
            } else {
                NetworkMode::None
            };
        }
    }

    /// Whether this profile has any legacy fields that need migration.
    pub fn needs_migration(&self) -> bool {
        self.api_key_env.is_some() || self.network_enabled.is_some()
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
    pub cpu_cores: u32,
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

// ── Chat message ─────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub role: String, // "user" or "assistant"
    pub content: String,
    pub timestamp: String, // ISO 8601
}

// ── Chat session (persisted per bot) ─────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub bot_id: String,
    pub name: String,
    pub created_at: String,
    pub messages: Vec<ChatMessage>,
}

// ── Chat session summary (returned in list, without messages) ────────
#[derive(Debug, Serialize, Clone)]
pub struct ChatSessionSummary {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub message_count: usize,
}

// ── Chat response chunk (streamed to frontend) ──────────────────────
#[derive(Debug, Serialize, Clone)]
pub struct ChatResponseChunk {
    pub session_id: String,
    pub content: String,
    pub done: bool,
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
        assert_eq!(bot.network_mode, NetworkMode::Bridge);
        assert!(bot.env_vars.is_empty());
        assert!(bot.workspace_path.is_none());
        assert!(bot.api_key_env.is_none());
        assert!(bot.cpu_limit.is_none());
        assert!(bot.memory_limit.is_none());
        assert!(bot.port_mappings.is_empty());
        assert!(!bot.id.is_empty());
    }

    #[test]
    fn container_name_format() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.id = "abc-123".to_string();
        assert_eq!(bot.container_name(), "clawpier-abc-123");
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

    // ── Phase 1-3: Resource limits ──────────────────────────────────

    #[test]
    fn resource_limits_roundtrip() {
        let mut bot = BotProfile::new("Res".into(), None);
        bot.cpu_limit = Some(2.5);
        bot.memory_limit = Some(4_294_967_296); // 4 GB

        let json = serde_json::to_string(&bot).unwrap();
        let restored: BotProfile = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.cpu_limit, Some(2.5));
        assert_eq!(restored.memory_limit, Some(4_294_967_296));
    }

    #[test]
    fn resource_limits_null_omitted() {
        let bot = BotProfile::new("NoLimits".into(), None);
        let json = serde_json::to_string(&bot).unwrap();
        // null fields should be omitted (skip_serializing_if)
        assert!(!json.contains("cpu_limit"));
        assert!(!json.contains("memory_limit"));

        let restored: BotProfile = serde_json::from_str(&json).unwrap();
        assert!(restored.cpu_limit.is_none());
        assert!(restored.memory_limit.is_none());
    }

    // ── Phase 1-3: Network mode ─────────────────────────────────────

    #[test]
    fn network_mode_none_serde() {
        let mode = NetworkMode::None;
        let json = serde_json::to_value(&mode).unwrap();
        assert_eq!(json, "none");
        let restored: NetworkMode = serde_json::from_value(json).unwrap();
        assert_eq!(restored, NetworkMode::None);
    }

    #[test]
    fn network_mode_bridge_serde() {
        let json = serde_json::to_value(&NetworkMode::Bridge).unwrap();
        assert_eq!(json, "bridge");
        assert_eq!(
            serde_json::from_value::<NetworkMode>(json).unwrap(),
            NetworkMode::Bridge
        );
    }

    #[test]
    fn network_mode_host_serde() {
        let json = serde_json::to_value(&NetworkMode::Host).unwrap();
        assert_eq!(json, "host");
        assert_eq!(
            serde_json::from_value::<NetworkMode>(json).unwrap(),
            NetworkMode::Host
        );
    }

    #[test]
    fn network_mode_custom_serde() {
        let mode = NetworkMode::Custom("my-network".to_string());
        let json = serde_json::to_value(&mode).unwrap();
        assert_eq!(json, serde_json::json!({"custom": "my-network"}));
        let restored: NetworkMode = serde_json::from_value(json).unwrap();
        assert_eq!(restored, NetworkMode::Custom("my-network".to_string()));
    }

    #[test]
    fn network_mode_default_is_bridge() {
        assert_eq!(NetworkMode::default(), NetworkMode::Bridge);
    }

    // ── Phase 1-3: Port mapping ─────────────────────────────────────

    #[test]
    fn port_mapping_roundtrip() {
        let mapping = PortMapping {
            container_port: 8080,
            host_port: 9090,
            protocol: "tcp".to_string(),
        };
        let json = serde_json::to_string(&mapping).unwrap();
        let restored: PortMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.container_port, 8080);
        assert_eq!(restored.host_port, 9090);
        assert_eq!(restored.protocol, "tcp");
    }

    #[test]
    fn port_mapping_udp() {
        let mapping = PortMapping {
            container_port: 53,
            host_port: 5353,
            protocol: "udp".to_string(),
        };
        let json = serde_json::to_string(&mapping).unwrap();
        let restored: PortMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.protocol, "udp");
    }

    // ── Phase 1-3: Full bot profile ─────────────────────────────────

    #[test]
    fn bot_profile_with_all_phase1_3_fields() {
        let mut bot = BotProfile::new("Full".into(), Some("/workspace".into()));
        bot.cpu_limit = Some(4.0);
        bot.memory_limit = Some(8_589_934_592);
        bot.network_mode = NetworkMode::Custom("docker-net".into());
        bot.port_mappings = vec![
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
        bot.env_vars = vec![EnvVar {
            key: "TOKEN".into(),
            value: "secret".into(),
        }];

        let json = serde_json::to_string(&bot).unwrap();
        let restored: BotProfile = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.cpu_limit, Some(4.0));
        assert_eq!(restored.memory_limit, Some(8_589_934_592));
        assert_eq!(
            restored.network_mode,
            NetworkMode::Custom("docker-net".into())
        );
        assert_eq!(restored.port_mappings.len(), 2);
        assert_eq!(restored.env_vars.len(), 1);
    }

    #[test]
    fn backward_compat_missing_new_fields() {
        // Simulate JSON from an older version without Phase 1-3 fields
        let json = r#"{
            "id": "test-id",
            "name": "OldBot",
            "image": "ghcr.io/openclaw/openclaw:latest",
            "env_vars": []
        }"#;
        let bot: BotProfile = serde_json::from_str(json).unwrap();

        assert!(bot.cpu_limit.is_none());
        assert!(bot.memory_limit.is_none());
        assert_eq!(bot.network_mode, NetworkMode::Bridge); // default
        assert!(bot.port_mappings.is_empty());
    }

    // ── Phase 1-3: Migration ────────────────────────────────────────

    #[test]
    fn migrate_network_enabled_true() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.network_enabled = Some(true);
        bot.migrate();
        assert_eq!(bot.network_mode, NetworkMode::Bridge);
        assert!(bot.network_enabled.is_none());
    }

    #[test]
    fn migrate_network_enabled_false() {
        let mut bot = BotProfile::new("Test".into(), None);
        bot.network_enabled = Some(false);
        bot.migrate();
        assert_eq!(bot.network_mode, NetworkMode::None);
        assert!(bot.network_enabled.is_none());
    }

    // ── Phase 1-3: Chat types ───────────────────────────────────────

    #[test]
    fn chat_message_roundtrip() {
        let msg = ChatMessage {
            id: "msg-1".into(),
            role: "user".into(),
            content: "Hello world".into(),
            timestamp: "2024-01-15T10:30:00Z".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let restored: ChatMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, "msg-1");
        assert_eq!(restored.role, "user");
        assert_eq!(restored.content, "Hello world");
    }

    #[test]
    fn chat_session_roundtrip() {
        let session = ChatSession {
            id: "sess-1".into(),
            bot_id: "bot-1".into(),
            name: "My Chat".into(),
            created_at: "2024-01-15T10:30:00Z".into(),
            messages: vec![
                ChatMessage {
                    id: "m1".into(),
                    role: "user".into(),
                    content: "Hi".into(),
                    timestamp: "2024-01-15T10:30:00Z".into(),
                },
                ChatMessage {
                    id: "m2".into(),
                    role: "assistant".into(),
                    content: "Hello!".into(),
                    timestamp: "2024-01-15T10:30:01Z".into(),
                },
            ],
        };
        let json = serde_json::to_string(&session).unwrap();
        let restored: ChatSession = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, "sess-1");
        assert_eq!(restored.messages.len(), 2);
        assert_eq!(restored.messages[1].content, "Hello!");
    }

    #[test]
    fn chat_session_summary_serialization() {
        let summary = ChatSessionSummary {
            id: "s1".into(),
            name: "Summary Test".into(),
            created_at: "2024-01-15T00:00:00Z".into(),
            message_count: 5,
        };
        let json = serde_json::to_value(&summary).unwrap();
        assert_eq!(json["message_count"], 5);
        assert_eq!(json["name"], "Summary Test");
    }

    #[test]
    fn chat_response_chunk_serialization() {
        let chunk = ChatResponseChunk {
            session_id: "sess-1".into(),
            content: "Hello ".into(),
            done: false,
        };
        let json = serde_json::to_value(&chunk).unwrap();
        assert_eq!(json["done"], false);
        assert_eq!(json["content"], "Hello ");

        let done_chunk = ChatResponseChunk {
            session_id: "sess-1".into(),
            content: "".into(),
            done: true,
        };
        let json = serde_json::to_value(&done_chunk).unwrap();
        assert_eq!(json["done"], true);
    }
}
