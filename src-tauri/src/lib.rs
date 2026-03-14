mod bot_store;
mod commands;
mod docker_manager;
mod error;
mod models;
mod state;
mod streaming;

use bot_store::BotStore;
use docker_manager::DockerManager;
use models::{BotStatus, BotWithStatus};
use state::AppState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = BotStore::new().expect("Failed to initialize bot store");
    let docker = DockerManager::new().expect("Failed to initialize Docker manager");
    let app_state = AppState::new(store, docker);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::check_docker,
            commands::check_image,
            commands::list_bots,
            commands::create_bot,
            commands::start_bot,
            commands::stop_bot,
            commands::restart_bot,
            commands::delete_bot,
            commands::rename_bot,
            commands::toggle_network,
            commands::pull_image,
            commands::update_env_vars,
            commands::start_stats_stream,
            commands::stop_stats_stream,
            commands::start_log_stream,
            commands::stop_log_stream,
            commands::exec_command,
            commands::list_workspace_files,
            commands::read_workspace_file,
            commands::start_terminal_session,
            commands::write_terminal_input,
            commands::resize_terminal,
        ])
        .setup(|app| {
            // Spawn background status polling task
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                    let state: tauri::State<'_, AppState> = handle.state::<AppState>();

                    let bots_with_status = {
                        let store: tokio::sync::MutexGuard<'_, BotStore> =
                            state.store.lock().await;
                        let docker: tokio::sync::MutexGuard<'_, DockerManager> =
                            state.docker.lock().await;

                        let bot_ids = store.get_bot_ids();
                        let statuses = docker.get_all_statuses(&bot_ids).await;

                        store
                            .get_all()
                            .iter()
                            .map(|bot| {
                                let status = statuses
                                    .get(&bot.id)
                                    .cloned()
                                    .unwrap_or(BotStatus::Stopped);
                                BotWithStatus {
                                    profile: bot.clone(),
                                    status,
                                }
                            })
                            .collect::<Vec<_>>()
                    };

                    let _ = handle.emit("bot-status-update", &bots_with_status);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
