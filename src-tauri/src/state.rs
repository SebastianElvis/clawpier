use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

use crate::bot_store::BotStore;
use crate::chat_store::ChatStore;
use crate::docker_manager::DockerManager;
use crate::streaming::StreamManager;

pub struct AppState {
    pub store: Mutex<BotStore>,
    pub docker: Mutex<DockerManager>,
    pub streams: Mutex<StreamManager>,
    pub chat_store: Mutex<ChatStore>,
    pub docker_connected: AtomicBool,
}

impl AppState {
    pub fn new(store: BotStore, docker: DockerManager, chat_store: ChatStore) -> Self {
        Self {
            store: Mutex::new(store),
            docker: Mutex::new(docker),
            streams: Mutex::new(StreamManager::new()),
            chat_store: Mutex::new(chat_store),
            docker_connected: AtomicBool::new(true),
        }
    }

    pub fn is_docker_connected(&self) -> bool {
        self.docker_connected.load(Ordering::Relaxed)
    }
}
