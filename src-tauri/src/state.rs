use tokio::sync::Mutex;

use crate::bot_store::BotStore;
use crate::docker_manager::DockerManager;

pub struct AppState {
    pub store: Mutex<BotStore>,
    pub docker: Mutex<DockerManager>,
}

impl AppState {
    pub fn new(store: BotStore, docker: DockerManager) -> Self {
        Self {
            store: Mutex::new(store),
            docker: Mutex::new(docker),
        }
    }
}
