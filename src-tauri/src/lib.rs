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
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

/// A detected status transition for a bot.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StatusTransition {
    pub bot_id: String,
    pub bot_name: String,
    pub from: String,
    pub to: String,
}

/// Extract the status type string from a BotStatus.
fn status_type_string(status: &BotStatus) -> String {
    match status {
        BotStatus::Running => "Running".to_string(),
        BotStatus::Stopped => "Stopped".to_string(),
        BotStatus::Error(_) => "Error".to_string(),
    }
}

/// Compare previous statuses with current ones and return transitions
/// where a bot went from Running to Stopped or Running to Error.
pub fn detect_status_transitions(
    previous: &HashMap<String, String>,
    current: &[(String, String, String)], // (id, name, status_type)
) -> Vec<StatusTransition> {
    let mut transitions = Vec::new();
    for (id, name, status) in current {
        if let Some(prev) = previous.get(id) {
            if prev == "Running" && (status == "Stopped" || status == "Error") {
                transitions.push(StatusTransition {
                    bot_id: id.clone(),
                    bot_name: name.clone(),
                    from: prev.clone(),
                    to: status.clone(),
                });
            }
        }
    }
    transitions
}

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
            commands::set_auto_start,
            commands::auto_start_bots,
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
            commands::stop_terminal_session,
            commands::write_terminal_input,
            commands::resize_terminal,
            commands::log_crash,
            commands::export_logs,
            commands::update_health_check,
            commands::clawhub_search_skills,
            commands::clawhub_install_skill,
            commands::clawhub_uninstall_skill,
            commands::check_clawhub_available,
            commands::install_clawhub,
            commands::clawhub_inspect_skill,
        ])
        .setup(|app| {
            // Spawn background status polling task
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut consecutive_failures: u32 = 0;
                let mut was_connected = true;
                let mut previous_statuses: HashMap<String, String> = HashMap::new();

                loop {
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

                        // Detect status transitions (Running → Stopped/Error)
                        let current: Vec<(String, String, String)> = bots_with_status
                            .iter()
                            .map(|b| {
                                (
                                    b.profile.id.clone(),
                                    b.profile.name.clone(),
                                    status_type_string(&b.status),
                                )
                            })
                            .collect();

                        let transitions =
                            detect_status_transitions(&previous_statuses, &current);

                        for transition in &transitions {
                            let _ = handle.emit("bot-status-changed", transition);
                        }

                        // Update previous statuses map
                        previous_statuses.clear();
                        for (id, _, status) in &current {
                            previous_statuses.insert(id.clone(), status.clone());
                        }

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

                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn no_transitions_when_no_change() {
        let mut prev = HashMap::new();
        prev.insert("bot-1".to_string(), "Running".to_string());

        let current = vec![("bot-1".into(), "Bot 1".into(), "Running".into())];
        let transitions = detect_status_transitions(&prev, &current);
        assert!(transitions.is_empty());
    }

    #[test]
    fn detects_running_to_stopped() {
        let mut prev = HashMap::new();
        prev.insert("bot-1".to_string(), "Running".to_string());

        let current = vec![("bot-1".into(), "Bot 1".into(), "Stopped".into())];
        let transitions = detect_status_transitions(&prev, &current);

        assert_eq!(transitions.len(), 1);
        assert_eq!(transitions[0].bot_id, "bot-1");
        assert_eq!(transitions[0].bot_name, "Bot 1");
        assert_eq!(transitions[0].from, "Running");
        assert_eq!(transitions[0].to, "Stopped");
    }

    #[test]
    fn detects_running_to_error() {
        let mut prev = HashMap::new();
        prev.insert("bot-1".to_string(), "Running".to_string());

        let current = vec![("bot-1".into(), "Bot 1".into(), "Error".into())];
        let transitions = detect_status_transitions(&prev, &current);

        assert_eq!(transitions.len(), 1);
        assert_eq!(transitions[0].to, "Error");
    }

    #[test]
    fn ignores_stopped_to_running() {
        let mut prev = HashMap::new();
        prev.insert("bot-1".to_string(), "Stopped".to_string());

        let current = vec![("bot-1".into(), "Bot 1".into(), "Running".into())];
        let transitions = detect_status_transitions(&prev, &current);
        assert!(transitions.is_empty());
    }

    #[test]
    fn ignores_new_bot_without_previous_status() {
        let prev = HashMap::new();

        let current = vec![("bot-new".into(), "New Bot".into(), "Running".into())];
        let transitions = detect_status_transitions(&prev, &current);
        assert!(transitions.is_empty());
    }

    #[test]
    fn detects_multiple_transitions() {
        let mut prev = HashMap::new();
        prev.insert("bot-1".to_string(), "Running".to_string());
        prev.insert("bot-2".to_string(), "Running".to_string());
        prev.insert("bot-3".to_string(), "Stopped".to_string());

        let current = vec![
            ("bot-1".into(), "Bot 1".into(), "Stopped".into()),
            ("bot-2".into(), "Bot 2".into(), "Error".into()),
            ("bot-3".into(), "Bot 3".into(), "Running".into()),
        ];
        let transitions = detect_status_transitions(&prev, &current);

        assert_eq!(transitions.len(), 2);
        assert!(transitions.iter().any(|t| t.bot_id == "bot-1" && t.to == "Stopped"));
        assert!(transitions.iter().any(|t| t.bot_id == "bot-2" && t.to == "Error"));
    }

    #[test]
    fn status_type_string_variants() {
        assert_eq!(status_type_string(&BotStatus::Running), "Running");
        assert_eq!(status_type_string(&BotStatus::Stopped), "Stopped");
        assert_eq!(
            status_type_string(&BotStatus::Error("fail".into())),
            "Error"
        );
    }
}
