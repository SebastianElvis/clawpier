mod bot_store;
mod chat_store;
mod commands;
mod docker_manager;
mod error;
mod models;
mod state;
mod streaming;

use bot_store::BotStore;
use chat_store::ChatStore;
use docker_manager::DockerManager;
use models::{BotStatus, BotWithStatus};
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = BotStore::new().expect("Failed to initialize bot store");
    let docker = DockerManager::new().expect("Failed to initialize Docker manager");
    let chat_store = ChatStore::new().expect("Failed to initialize chat store");
    let app_state = AppState::new(store, docker, chat_store);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_system_resources,
            commands::check_docker,
            commands::check_docker_health,
            commands::check_image,
            commands::list_bots,
            commands::create_bot,
            commands::start_bot,
            commands::stop_bot,
            commands::restart_bot,
            commands::delete_bot,
            commands::rename_bot,
            commands::toggle_network,
            commands::set_workspace_path,
            commands::pull_image,
            commands::update_env_vars,
            commands::update_resource_limits,
            commands::set_network_mode,
            commands::update_port_mappings,
            commands::export_config,
            commands::import_config,
            commands::list_chat_sessions,
            commands::create_chat_session,
            commands::rename_chat_session,
            commands::delete_chat_session,
            commands::get_chat_messages,
            commands::send_chat_message,
            commands::stop_chat_response,
            commands::start_stats_stream,
            commands::stop_stats_stream,
            commands::start_log_stream,
            commands::stop_log_stream,
            commands::exec_command,
            commands::list_workspace_files,
            commands::read_workspace_file,
            commands::get_bot_config,
            commands::resolve_telegram_bot,
            commands::start_terminal_session,
            commands::write_terminal_input,
            commands::resize_terminal,
        ])
        .setup(|app| {
            // Spawn background status polling task
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut consecutive_failures: u32 = 0;
                let mut was_connected = true;

                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                    let state: tauri::State<'_, AppState> = handle.state::<AppState>();

                    // First, ping Docker to check connectivity
                    let docker_ok = {
                        let docker = state.docker.lock().await;
                        docker.check_docker().await.is_ok()
                    };

                    if docker_ok {
                        // Docker is reachable — reset failure tracking
                        if !was_connected {
                            state.docker_connected.store(true, Ordering::Relaxed);
                            let _ = handle.emit("docker-connection-restored", ());
                            was_connected = true;
                        }
                        consecutive_failures = 0;

                        // Fetch and emit statuses as before
                        let bots_with_status = {
                            let store = state.store.lock().await;
                            let docker = state.docker.lock().await;

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
                    } else {
                        consecutive_failures += 1;
                        eprintln!(
                            "Docker poll error (consecutive: {})",
                            consecutive_failures
                        );

                        if consecutive_failures >= 3 && was_connected {
                            state.docker_connected.store(false, Ordering::Relaxed);
                            let _ = handle.emit("docker-connection-lost", ());
                            was_connected = false;
                        }

                        // While disconnected, emit unknown/error statuses so UI updates
                        if !was_connected {
                            let bots_with_status = {
                                let store = state.store.lock().await;
                                store
                                    .get_all()
                                    .iter()
                                    .map(|bot| BotWithStatus {
                                        profile: bot.clone(),
                                        status: BotStatus::Error(
                                            "Docker unavailable".to_string(),
                                        ),
                                    })
                                    .collect::<Vec<_>>()
                            };

                            let _ = handle.emit("bot-status-update", &bots_with_status);
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
