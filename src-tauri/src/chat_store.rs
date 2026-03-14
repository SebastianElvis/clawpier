use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{ChatMessage, ChatSession, ChatSessionSummary};

pub struct ChatStore {
    base_dir: PathBuf,
}

impl ChatStore {
    pub fn new() -> Result<Self, AppError> {
        let base_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clawpier")
            .join("chats");
        std::fs::create_dir_all(&base_dir)?;
        Ok(Self { base_dir })
    }

    fn bot_dir(&self, bot_id: &str) -> PathBuf {
        self.base_dir.join(bot_id)
    }

    fn session_path(&self, bot_id: &str, session_id: &str) -> PathBuf {
        self.bot_dir(bot_id).join(format!("{}.json", session_id))
    }

    fn load_session(&self, bot_id: &str, session_id: &str) -> Result<ChatSession, AppError> {
        let path = self.session_path(bot_id, session_id);
        if !path.exists() {
            return Err(AppError::Other(format!(
                "Chat session not found: {}",
                session_id
            )));
        }
        let data = std::fs::read_to_string(&path)?;
        let session: ChatSession = serde_json::from_str(&data)?;
        Ok(session)
    }

    fn save_session(&self, session: &ChatSession) -> Result<(), AppError> {
        let dir = self.bot_dir(&session.bot_id);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{}.json", session.id));
        let data = serde_json::to_string_pretty(session)?;
        std::fs::write(&path, data)?;
        Ok(())
    }

    pub fn list_sessions(&self, bot_id: &str) -> Vec<ChatSessionSummary> {
        let dir = self.bot_dir(bot_id);
        if !dir.exists() {
            return Vec::new();
        }

        let mut sessions = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|ext| ext == "json") {
                    if let Ok(data) = std::fs::read_to_string(&path) {
                        if let Ok(session) = serde_json::from_str::<ChatSession>(&data) {
                            sessions.push(ChatSessionSummary {
                                id: session.id,
                                name: session.name,
                                created_at: session.created_at,
                                message_count: session.messages.len(),
                            });
                        }
                    }
                }
            }
        }

        // Sort by creation time, newest first
        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        sessions
    }

    pub fn create_session(
        &mut self,
        bot_id: &str,
        name: &str,
    ) -> Result<ChatSessionSummary, AppError> {
        let session = ChatSession {
            id: uuid::Uuid::new_v4().to_string(),
            bot_id: bot_id.to_string(),
            name: name.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            messages: Vec::new(),
        };
        self.save_session(&session)?;
        Ok(ChatSessionSummary {
            id: session.id,
            name: session.name,
            created_at: session.created_at,
            message_count: 0,
        })
    }

    pub fn rename_session(
        &mut self,
        bot_id: &str,
        session_id: &str,
        name: &str,
    ) -> Result<(), AppError> {
        let mut session = self.load_session(bot_id, session_id)?;
        session.name = name.to_string();
        self.save_session(&session)
    }

    pub fn delete_session(&mut self, bot_id: &str, session_id: &str) -> Result<(), AppError> {
        let path = self.session_path(bot_id, session_id);
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }

    pub fn get_messages(
        &self,
        bot_id: &str,
        session_id: &str,
    ) -> Result<Vec<ChatMessage>, AppError> {
        let session = self.load_session(bot_id, session_id)?;
        Ok(session.messages)
    }

    pub fn add_message(
        &mut self,
        bot_id: &str,
        session_id: &str,
        message: ChatMessage,
    ) -> Result<(), AppError> {
        let mut session = self.load_session(bot_id, session_id)?;
        session.messages.push(message);
        self.save_session(&session)
    }
}
