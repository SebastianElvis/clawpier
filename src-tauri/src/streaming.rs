use std::collections::HashMap;
use tauri::async_runtime::JoinHandle;

/// Kinds of streaming tasks we track per bot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StreamKind {
    Stats,
    Logs,
}

/// Manages active streaming tasks (stats, logs) per bot.
/// Each bot can have at most one task of each kind running.
pub struct StreamManager {
    tasks: HashMap<String, HashMap<StreamKind, JoinHandle<()>>>,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            tasks: HashMap::new(),
        }
    }

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

    /// Check if a specific stream is active for a bot.
    pub fn is_active(&self, bot_id: &str, kind: StreamKind) -> bool {
        self.tasks
            .get(bot_id)
            .and_then(|kinds| kinds.get(&kind))
            .is_some()
    }
}
