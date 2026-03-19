use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;

use tauri::async_runtime::JoinHandle;
use tokio::io::AsyncWrite;
use tokio::sync::Mutex as TokioMutex;

/// Kinds of streaming tasks we track per bot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StreamKind {
    Stats,
    Logs,
    Chat,
    Health,
}

/// An active interactive shell session inside a container.
pub struct InteractiveSession {
    /// Stdin writer for the exec session (Arc'd so we can clone without holding StreamManager lock).
    pub input: Arc<TokioMutex<Pin<Box<dyn AsyncWrite + Send>>>>,
    /// The background task streaming output to the frontend.
    pub output_task: JoinHandle<()>,
    /// Docker exec ID (needed for resize operations).
    pub exec_id: String,
}

/// Manages active streaming tasks (stats, logs) and interactive sessions per bot.
/// Each bot can have at most one task of each kind running, and at most one interactive session.
pub struct StreamManager {
    tasks: HashMap<String, HashMap<StreamKind, JoinHandle<()>>>,
    sessions: HashMap<String, InteractiveSession>,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
            sessions: HashMap::new(),
        }
    }

    // ── Streaming tasks (stats, logs) ────────────────────────────────

    /// Start (or replace) a streaming task for a bot.
    /// If a task of the same kind is already running, it is aborted first.
    pub fn start(&mut self, bot_id: &str, kind: StreamKind, handle: JoinHandle<()>) {
        let entry = self.tasks.entry(bot_id.to_string()).or_default();
        if let Some(old) = entry.insert(kind, handle) {
            old.abort();
        }
    }

    /// Stop a specific streaming task for a bot.
    pub fn stop(&mut self, bot_id: &str, kind: StreamKind) {
        if let Some(kinds) = self.tasks.get_mut(bot_id) {
            if let Some(handle) = kinds.remove(&kind) {
                handle.abort();
            }
            if kinds.is_empty() {
                self.tasks.remove(bot_id);
            }
        }
    }

    /// Stop all streaming tasks for a bot.
    pub fn stop_all(&mut self, bot_id: &str) {
        if let Some(kinds) = self.tasks.remove(bot_id) {
            for (_, handle) in kinds {
                handle.abort();
            }
        }
    }

    // ── Interactive sessions ─────────────────────────────────────────

    /// Start (or replace) an interactive session for a bot.
    pub fn start_session(&mut self, bot_id: &str, session: InteractiveSession) {
        if let Some(old) = self.sessions.remove(bot_id) {
            old.output_task.abort();
        }
        self.sessions.insert(bot_id.to_string(), session);
    }

    /// Clone the Arc to the stdin writer for a bot's interactive session.
    /// Returns None if no session is active.
    pub fn get_session_input(
        &self,
        bot_id: &str,
    ) -> Option<Arc<TokioMutex<Pin<Box<dyn AsyncWrite + Send>>>>> {
        self.sessions.get(bot_id).map(|s| Arc::clone(&s.input))
    }

    /// Get the Docker exec ID for a bot's interactive session (needed for resize).
    pub fn get_exec_id(&self, bot_id: &str) -> Option<String> {
        self.sessions.get(bot_id).map(|s| s.exec_id.clone())
    }

    /// Stop the interactive session for a bot.
    pub fn stop_session(&mut self, bot_id: &str) {
        if let Some(session) = self.sessions.remove(bot_id) {
            session.output_task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::sink;

    fn mock_session(exec_id: &str) -> InteractiveSession {
        let writer: Pin<Box<dyn AsyncWrite + Send>> = Box::pin(sink());
        InteractiveSession {
            input: Arc::new(TokioMutex::new(writer)),
            output_task: tauri::async_runtime::spawn(async {}),
            exec_id: exec_id.to_string(),
        }
    }

    #[test]
    fn new_manager_is_empty() {
        let mgr = StreamManager::new();
        assert!(mgr.get_exec_id("any").is_none());
        assert!(mgr.get_session_input("any").is_none());
    }

    #[test]
    fn start_and_stop_streaming_task() {
        let mut mgr = StreamManager::new();
        let handle = tauri::async_runtime::spawn(async {});
        mgr.start("bot1", StreamKind::Stats, handle);
        assert!(mgr.tasks.contains_key("bot1"));

        mgr.stop("bot1", StreamKind::Stats);
        assert!(!mgr.tasks.contains_key("bot1"));
    }

    #[test]
    fn start_replaces_existing_task() {
        let mut mgr = StreamManager::new();
        let h1 = tauri::async_runtime::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        });
        let h2 = tauri::async_runtime::spawn(async {});

        mgr.start("bot1", StreamKind::Stats, h1);
        mgr.start("bot1", StreamKind::Stats, h2);

        // Only one Stats task exists
        assert_eq!(mgr.tasks["bot1"].len(), 1);
    }

    #[test]
    fn stop_all_clears_all_kinds() {
        let mut mgr = StreamManager::new();
        mgr.start(
            "bot1",
            StreamKind::Stats,
            tauri::async_runtime::spawn(async {}),
        );
        mgr.start(
            "bot1",
            StreamKind::Logs,
            tauri::async_runtime::spawn(async {}),
        );
        assert_eq!(mgr.tasks["bot1"].len(), 2);

        mgr.stop_all("bot1");
        assert!(!mgr.tasks.contains_key("bot1"));
    }

    #[test]
    fn session_lifecycle() {
        let mut mgr = StreamManager::new();
        assert!(mgr.get_exec_id("bot1").is_none());

        mgr.start_session("bot1", mock_session("exec-123"));

        assert_eq!(mgr.get_exec_id("bot1").unwrap(), "exec-123");
        assert!(mgr.get_session_input("bot1").is_some());

        mgr.stop_session("bot1");
        assert!(mgr.get_exec_id("bot1").is_none());
    }

    #[test]
    fn replace_session() {
        let mut mgr = StreamManager::new();
        mgr.start_session("bot1", mock_session("exec-1"));
        mgr.start_session("bot1", mock_session("exec-2"));

        assert_eq!(mgr.get_exec_id("bot1").unwrap(), "exec-2");
    }

    #[test]
    fn stop_nonexistent_is_noop() {
        let mut mgr = StreamManager::new();
        // None of these should panic
        mgr.stop("ghost", StreamKind::Stats);
        mgr.stop_all("ghost");
        mgr.stop_session("ghost");
    }
}
