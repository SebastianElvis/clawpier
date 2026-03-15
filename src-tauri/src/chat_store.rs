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

    /// Test-only constructor that uses a custom base directory.
    #[cfg(test)]
    pub fn from_path(base_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&base_dir).expect("create test chat dir");
        Self { base_dir }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ChatMessage;

    fn temp_chat_store() -> (ChatStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let base = dir.path().join("chats");
        (ChatStore::from_path(base), dir)
    }

    fn make_message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: role.to_string(),
            content: content.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    #[test]
    fn create_and_list_sessions() {
        let (mut store, _dir) = temp_chat_store();
        let s1 = store.create_session("bot-1", "Chat 1").unwrap();
        let s2 = store.create_session("bot-1", "Chat 2").unwrap();

        assert_eq!(s1.name, "Chat 1");
        assert_eq!(s1.message_count, 0);
        assert_eq!(s2.name, "Chat 2");

        let sessions = store.list_sessions("bot-1");
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn list_sessions_empty_for_unknown_bot() {
        let (store, _dir) = temp_chat_store();
        let sessions = store.list_sessions("nonexistent-bot");
        assert!(sessions.is_empty());
    }

    #[test]
    fn add_and_get_messages() {
        let (mut store, _dir) = temp_chat_store();
        let session = store.create_session("bot-1", "Chat").unwrap();

        store
            .add_message("bot-1", &session.id, make_message("user", "Hello"))
            .unwrap();
        store
            .add_message(
                "bot-1",
                &session.id,
                make_message("assistant", "Hi there!"),
            )
            .unwrap();

        let msgs = store.get_messages("bot-1", &session.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].content, "Hello");
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].content, "Hi there!");
    }

    #[test]
    fn rename_session() {
        let (mut store, _dir) = temp_chat_store();
        let session = store.create_session("bot-1", "Old Name").unwrap();

        store
            .rename_session("bot-1", &session.id, "New Name")
            .unwrap();

        let sessions = store.list_sessions("bot-1");
        assert_eq!(sessions[0].name, "New Name");
    }

    #[test]
    fn delete_session() {
        let (mut store, _dir) = temp_chat_store();
        let session = store.create_session("bot-1", "Doomed").unwrap();
        assert_eq!(store.list_sessions("bot-1").len(), 1);

        store.delete_session("bot-1", &session.id).unwrap();
        assert!(store.list_sessions("bot-1").is_empty());
    }

    #[test]
    fn delete_nonexistent_session_ok() {
        let (mut store, _dir) = temp_chat_store();
        // Deleting a session that doesn't exist should not error
        store.delete_session("bot-1", "no-such-session").unwrap();
    }

    #[test]
    fn get_messages_nonexistent_session_fails() {
        let (store, _dir) = temp_chat_store();
        let result = store.get_messages("bot-1", "no-such-session");
        assert!(result.is_err());
    }

    #[test]
    fn add_message_nonexistent_session_fails() {
        let (mut store, _dir) = temp_chat_store();
        let result = store.add_message("bot-1", "no-such", make_message("user", "hi"));
        assert!(result.is_err());
    }

    #[test]
    fn sessions_isolated_per_bot() {
        let (mut store, _dir) = temp_chat_store();
        store.create_session("bot-a", "Chat A").unwrap();
        store.create_session("bot-b", "Chat B").unwrap();

        assert_eq!(store.list_sessions("bot-a").len(), 1);
        assert_eq!(store.list_sessions("bot-b").len(), 1);
        assert_eq!(store.list_sessions("bot-a")[0].name, "Chat A");
    }

    #[test]
    fn message_count_in_summary() {
        let (mut store, _dir) = temp_chat_store();
        let session = store.create_session("bot-1", "Counter").unwrap();

        store
            .add_message("bot-1", &session.id, make_message("user", "1"))
            .unwrap();
        store
            .add_message("bot-1", &session.id, make_message("assistant", "2"))
            .unwrap();
        store
            .add_message("bot-1", &session.id, make_message("user", "3"))
            .unwrap();

        let sessions = store.list_sessions("bot-1");
        assert_eq!(sessions[0].message_count, 3);
    }

    #[test]
    fn session_data_persists_on_disk() {
        let dir = tempfile::tempdir().expect("create temp dir");
        let base = dir.path().join("chats");

        let session_id;
        // Create and populate
        {
            let mut store = ChatStore::from_path(base.clone());
            let session = store.create_session("bot-1", "Persist").unwrap();
            session_id = session.id;
            store
                .add_message("bot-1", &session_id, make_message("user", "persisted"))
                .unwrap();
        }

        // Reload from disk
        {
            let store = ChatStore::from_path(base);
            let msgs = store.get_messages("bot-1", &session_id).unwrap();
            assert_eq!(msgs.len(), 1);
            assert_eq!(msgs[0].content, "persisted");
        }
    }
}
