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

    /// Check if a bot has an active interactive session.
    pub fn has_session(&self, bot_id: &str) -> bool {
        self.sessions.contains_key(bot_id)
    }

    /// Stop the interactive session for a bot.
    pub fn stop_session(&mut self, bot_id: &str) {
        if let Some(session) = self.sessions.remove(bot_id) {
            session.output_task.abort();
        }
    }
}
