use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;

use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecResults};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as TokioMutex;

use crate::docker_manager::{self, DockerManager};
use crate::error::AppError;
use crate::models::{
    BotProfile, BotStatus, BotWithStatus, ChatMessage, ChatResponseChunk, ChatSessionSummary,
    EnvVar, ExecResult, FileEntry, NetworkMode, PortMapping,
};
use crate::state::AppState;
use crate::streaming::{InteractiveSession, StreamKind};

// ── Validation helpers ────────────────────────────────────────────────

/// Directories that must never be used as workspace paths.
const BLOCKED_WORKSPACE_PATHS: &[&str] = &[
    "/", "/etc", "/var", "/usr", "/bin", "/sbin", "/lib",
    "/System", "/Library", "/private", "/dev", "/proc", "/sys",
    "/tmp", "/boot", "/root",
];

/// Environment variable keys that are blocked from user injection.
const BLOCKED_ENV_KEYS: &[&str] = &[
    "PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH", "NODE_OPTIONS", "PYTHONPATH", "RUBYLIB",
    "PERL5LIB", "CLASSPATH", "HOME", "USER", "SHELL",
];

/// Trusted image registries. Images must start with one of these prefixes
/// or be a bare Docker Hub image name (no registry prefix).
const TRUSTED_REGISTRIES: &[&str] = &[
    "ghcr.io/openclaw/",
    "docker.io/library/",
    "busybox",
];

fn validate_workspace_path(path: &str) -> Result<(), AppError> {
    let canonical = std::fs::canonicalize(path).map_err(|_| {
        AppError::Validation(format!("Workspace path does not exist: {}", path))
    })?;
    let canonical_str = canonical.to_string_lossy();

    for blocked in BLOCKED_WORKSPACE_PATHS {
        if canonical_str == *blocked {
            return Err(AppError::Validation(format!(
                "Workspace path '{}' is a sensitive system directory",
                blocked
            )));
        }
    }

    if !canonical.is_dir() {
        return Err(AppError::Validation(
            "Workspace path must be a directory".into(),
        ));
    }

    Ok(())
}

fn validate_env_vars(env_vars: &[EnvVar]) -> Result<(), AppError> {
    for ev in env_vars {
        let upper = ev.key.to_uppercase();
        if BLOCKED_ENV_KEYS.iter().any(|k| upper == *k) {
            return Err(AppError::Validation(format!(
                "Environment variable '{}' is blocked for security reasons",
                ev.key
            )));
        }
        if ev.key.is_empty() || ev.key.contains('=') || ev.key.contains('\0') {
            return Err(AppError::Validation(format!(
                "Invalid environment variable key: '{}'",
                ev.key
            )));
        }
    }
    Ok(())
}

fn validate_port_mappings(mappings: &[PortMapping]) -> Result<(), AppError> {
    for m in mappings {
        if m.protocol != "tcp" && m.protocol != "udp" {
            return Err(AppError::Validation(format!(
                "Invalid protocol '{}': must be 'tcp' or 'udp'",
                m.protocol
            )));
        }
        if m.container_port == 0 || m.host_port == 0 {
            return Err(AppError::Validation(
                "Port numbers must be between 1 and 65535".into(),
            ));
        }
        if m.host_port < 1024 {
            return Err(AppError::Validation(format!(
                "Host port {} is privileged (< 1024); use a port >= 1024",
                m.host_port
            )));
        }
    }
    Ok(())
}

fn validate_resource_limits(
    cpu_limit: Option<f64>,
    memory_limit: Option<u64>,
) -> Result<(), AppError> {
    if let Some(cpu) = cpu_limit {
        if cpu <= 0.0 || cpu > 128.0 {
            return Err(AppError::Validation(
                "CPU limit must be between 0.01 and 128 cores".into(),
            ));
        }
    }
    if let Some(mem) = memory_limit {
        // Minimum 4MB (Docker's own minimum)
        if mem < 4 * 1024 * 1024 {
            return Err(AppError::Validation(
                "Memory limit must be at least 4 MB".into(),
            ));
        }
    }
    Ok(())
}

fn validate_image_name(image: &str) -> Result<(), AppError> {
    if image.is_empty() {
        return Err(AppError::Validation("Image name must not be empty".into()));
    }
    if TRUSTED_REGISTRIES.iter().any(|r| image.starts_with(r)) {
        return Ok(());
    }
    Err(AppError::Validation(format!(
        "Image '{}' is not from a trusted registry",
        image
    )))
}

// ── System info ──────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemResources {
    pub cpu_cores: u32,
    pub memory_bytes: u64,
}

#[tauri::command]
pub fn get_system_resources() -> SystemResources {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
    let sys = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::new())
            .with_memory(MemoryRefreshKind::everything()),
    );

    SystemResources {
        cpu_cores: sys.cpus().len() as u32,
        memory_bytes: sys.total_memory(),
    }
}

// ── Existing commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn check_docker(state: State<'_, AppState>) -> Result<bool, AppError> {
    let docker = state.docker.lock().await;
    docker.check_docker().await
}

#[tauri::command]
pub async fn check_image(state: State<'_, AppState>, image: String) -> Result<bool, AppError> {
    let docker = state.docker.lock().await;
    docker.check_image(&image).await
}

#[tauri::command]
pub async fn list_bots(state: State<'_, AppState>) -> Result<Vec<BotWithStatus>, AppError> {
    let store = state.store.lock().await;
    let docker = state.docker.lock().await;

    let bot_ids = store.get_bot_ids();
    let statuses = docker.get_all_statuses(&bot_ids).await;

    let bots_with_status: Vec<BotWithStatus> = store
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
        .collect();

    Ok(bots_with_status)
}

#[tauri::command]
pub async fn create_bot(
    state: State<'_, AppState>,
    name: String,
    workspace_path: Option<String>,
    cpu_limit: Option<f64>,
    memory_limit: Option<u64>,
    network_mode: Option<NetworkMode>,
) -> Result<BotProfile, AppError> {
    if let Some(ref path) = workspace_path {
        validate_workspace_path(path)?;
    }
    validate_resource_limits(cpu_limit, memory_limit)?;
    let mut store = state.store.lock().await;
    let mut bot = BotProfile::new(name, workspace_path);
    if cpu_limit.is_some() {
        bot.cpu_limit = cpu_limit;
    }
    if memory_limit.is_some() {
        bot.memory_limit = memory_limit;
    }
    if let Some(mode) = network_mode {
        bot.network_mode = mode;
    }
    store.add(bot.clone())?;
    Ok(bot)
}

#[tauri::command]
pub async fn start_bot(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let bot = store
        .get_by_id(&id)
        .ok_or_else(|| AppError::BotNotFound(id.clone()))?
        .clone();
    drop(store);

    let docker = state.docker.lock().await;
    docker.start_bot(&bot).await
}

#[tauri::command]
pub async fn stop_bot(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    // Stop any active streams and interactive session for this bot
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
    streams.stop_session(&id);
    drop(streams);

    let docker = state.docker.lock().await;
    docker.stop_bot(&id).await
}

#[tauri::command]
pub async fn restart_bot(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    // Clean up streams and terminal session
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
    streams.stop_session(&id);
    drop(streams);

    // Stop and remove the container
    let docker = state.docker.lock().await;
    let _ = docker.stop_bot(&id).await;
    drop(docker);

    // Re-read the profile and start a fresh container
    let store = state.store.lock().await;
    let bot = store
        .get_by_id(&id)
        .ok_or_else(|| AppError::BotNotFound(id.clone()))?
        .clone();
    drop(store);

    let docker = state.docker.lock().await;
    docker.start_bot(&bot).await?;
    drop(docker);

    // Notify frontend AFTER the new container is running and ready for exec
    let _ = app.emit(&format!("terminal-disconnect-{}", id), "restart");

    Ok(())
}

#[tauri::command]
pub async fn delete_bot(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    // Stop streams and interactive session
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
    streams.stop_session(&id);
    drop(streams);

    // Stop and remove container first
    let docker = state.docker.lock().await;
    let _ = docker.stop_bot(&id).await;
    drop(docker);

    // Remove from store
    let mut store = state.store.lock().await;
    store.remove(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn rename_bot(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    store.rename(&id, name)
}

#[tauri::command]
pub async fn toggle_network(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    store.toggle_network(&id, enabled)
}

#[tauri::command]
pub async fn set_workspace_path(
    state: State<'_, AppState>,
    id: String,
    workspace_path: Option<String>,
) -> Result<(), AppError> {
    if let Some(ref path) = workspace_path {
        validate_workspace_path(path)?;
    }
    let mut store = state.store.lock().await;
    store.set_workspace_path(&id, workspace_path)
}

#[tauri::command]
pub async fn pull_image(state: State<'_, AppState>, image: String) -> Result<(), AppError> {
    validate_image_name(&image)?;
    let docker = state.docker.lock().await;
    docker.pull_image(&image).await
}

// ── New commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn update_env_vars(
    state: State<'_, AppState>,
    id: String,
    env_vars: Vec<EnvVar>,
) -> Result<(), AppError> {
    validate_env_vars(&env_vars)?;
    let mut store = state.store.lock().await;
    store.update_env_vars(&id, env_vars)
}

#[tauri::command]
pub async fn update_resource_limits(
    state: State<'_, AppState>,
    id: String,
    cpu_limit: Option<f64>,
    memory_limit: Option<u64>,
) -> Result<(), AppError> {
    validate_resource_limits(cpu_limit, memory_limit)?;
    let mut store = state.store.lock().await;
    store.update_resource_limits(&id, cpu_limit, memory_limit)
}

#[tauri::command]
pub async fn set_network_mode(
    state: State<'_, AppState>,
    id: String,
    mode: NetworkMode,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    store.set_network_mode(&id, mode)
}

#[tauri::command]
pub async fn update_port_mappings(
    state: State<'_, AppState>,
    id: String,
    port_mappings: Vec<PortMapping>,
) -> Result<(), AppError> {
    validate_port_mappings(&port_mappings)?;
    let mut store = state.store.lock().await;
    store.update_port_mappings(&id, port_mappings)
}

// ── Chat commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<ChatSessionSummary>, AppError> {
    let chat_store = state.chat_store.lock().await;
    Ok(chat_store.list_sessions(&id))
}

#[tauri::command]
pub async fn create_chat_session(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<ChatSessionSummary, AppError> {
    let mut chat_store = state.chat_store.lock().await;
    chat_store.create_session(&id, &name)
}

#[tauri::command]
pub async fn rename_chat_session(
    state: State<'_, AppState>,
    id: String,
    session_id: String,
    name: String,
) -> Result<(), AppError> {
    let mut chat_store = state.chat_store.lock().await;
    chat_store.rename_session(&id, &session_id, &name)
}

#[tauri::command]
pub async fn delete_chat_session(
    state: State<'_, AppState>,
    id: String,
    session_id: String,
) -> Result<(), AppError> {
    let mut chat_store = state.chat_store.lock().await;
    chat_store.delete_session(&id, &session_id)
}

#[tauri::command]
pub async fn get_chat_messages(
    state: State<'_, AppState>,
    id: String,
    session_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    let chat_store = state.chat_store.lock().await;
    chat_store.get_messages(&id, &session_id)
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    session_id: String,
    message: String,
) -> Result<(), AppError> {
    // Store user message
    let user_msg = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        role: "user".to_string(),
        content: message.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    {
        let mut chat_store = state.chat_store.lock().await;
        chat_store.add_message(&id, &session_id, user_msg)?;
    }

    // Get container name and docker client
    let container_name = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.container_name()
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let bot_id = id.clone();
    let sess_id = session_id.clone();
    let event_name = format!("chat-response-{}", id);
    let app_handle = app.clone();

    // Spawn background task to exec chat command and stream response
    let mut streams = state.streams.lock().await;
    let handle = tauri::async_runtime::spawn(async move {
        use bollard::exec::CreateExecOptions;

        // Use an array-based command to avoid shell injection.
        // Pass the message via stdin.
        let config = CreateExecOptions {
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            cmd: Some(vec!["/usr/local/bin/openclaw", "chat", "--pipe"]),
            ..Default::default()
        };

        let mut response_content = String::new();

        match docker.create_exec(&container_name, config).await {
            Ok(created) => {
                match docker.start_exec(&created.id, None).await {
                    Ok(bollard::exec::StartExecResults::Attached {
                        output: mut stream,
                        input,
                    }) => {
                        // Write the message to stdin and close it
                        let mut writer = input;
                        let _ =
                            tokio::io::AsyncWriteExt::write_all(&mut writer, message.as_bytes())
                                .await;
                        let _ = tokio::io::AsyncWriteExt::shutdown(&mut writer).await;
                        drop(writer);

                        // Stream stdout
                        while let Some(Ok(msg)) = stream.next().await {
                            let text = match msg {
                                bollard::container::LogOutput::StdOut { message } => {
                                    String::from_utf8_lossy(&message).to_string()
                                }
                                _ => continue,
                            };
                            if !text.is_empty() {
                                response_content.push_str(&text);
                                let chunk = ChatResponseChunk {
                                    session_id: sess_id.clone(),
                                    content: text,
                                    done: false,
                                };
                                let _ = app_handle.emit(&event_name, &chunk);
                            }
                        }
                    }
                    Ok(bollard::exec::StartExecResults::Detached) => {
                        response_content =
                            "Error: exec started in detached mode".to_string();
                    }
                    Err(e) => {
                        response_content = format!("Error: {}", e);
                    }
                }
            }
            Err(e) => {
                response_content = format!("Error: {}", e);
                let chunk = ChatResponseChunk {
                    session_id: sess_id.clone(),
                    content: response_content.clone(),
                    done: false,
                };
                let _ = app_handle.emit(&event_name, &chunk);
            }
        }

        // Send done signal
        let done_chunk = ChatResponseChunk {
            session_id: sess_id.clone(),
            content: String::new(),
            done: true,
        };
        let _ = app_handle.emit(&event_name, &done_chunk);

        // Store assistant message
        if !response_content.trim().is_empty() {
            let assistant_msg = ChatMessage {
                id: uuid::Uuid::new_v4().to_string(),
                role: "assistant".to_string(),
                content: response_content.trim().to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            let state = app_handle.state::<AppState>();
            let mut chat_store: tokio::sync::MutexGuard<'_, crate::chat_store::ChatStore> =
                state.chat_store.lock().await;
            let _ = chat_store.add_message(&bot_id, &sess_id, assistant_msg);
        }
    });

    streams.start(&id, StreamKind::Chat, handle);

    Ok(())
}

#[tauri::command]
pub async fn stop_chat_response(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut streams = state.streams.lock().await;
    streams.stop(&id, StreamKind::Chat);
    Ok(())
}

#[tauri::command]
pub async fn start_stats_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let container_name = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.container_name()
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let bot_id = id.clone();
    let event_name = format!("container-stats-{}", id);

    let handle = tauri::async_runtime::spawn(async move {
        let options = docker_manager::stats_options();
        let mut stream = docker.stats(&container_name, Some(options));

        while let Some(Ok(stats)) = stream.next().await {
            let parsed = DockerManager::parse_stats(&stats);
            let _ = app.emit(&event_name, &parsed);
        }
    });

    let mut streams = state.streams.lock().await;
    streams.start(&bot_id, StreamKind::Stats, handle);

    Ok(())
}

#[tauri::command]
pub async fn stop_stats_stream(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut streams = state.streams.lock().await;
    streams.stop(&id, StreamKind::Stats);
    Ok(())
}

#[tauri::command]
pub async fn start_log_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    tail: Option<u64>,
) -> Result<(), AppError> {
    let container_name = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.container_name()
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let bot_id = id.clone();
    let event_name = format!("container-log-{}", id);

    let handle = tauri::async_runtime::spawn(async move {
        let options = docker_manager::log_options(tail);
        let mut stream = docker.logs(&container_name, Some(options));

        while let Some(Ok(output)) = stream.next().await {
            let entry = DockerManager::parse_log_output(&output);
            let _ = app.emit(&event_name, &entry);
        }
    });

    let mut streams = state.streams.lock().await;
    streams.start(&bot_id, StreamKind::Logs, handle);

    Ok(())
}

#[tauri::command]
pub async fn stop_log_stream(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut streams = state.streams.lock().await;
    streams.stop(&id, StreamKind::Logs);
    Ok(())
}

#[tauri::command]
pub async fn exec_command(
    state: State<'_, AppState>,
    id: String,
    args: Vec<String>,
) -> Result<ExecResult, AppError> {
    if args.is_empty() {
        return Err(AppError::Validation("Command must not be empty".into()));
    }

    let container_name = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.container_name()
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    DockerManager::exec_in_container(&docker, &container_name, &arg_refs).await
}

#[tauri::command]
pub async fn list_workspace_files(
    state: State<'_, AppState>,
    id: String,
    path: Option<String>,
) -> Result<Vec<FileEntry>, AppError> {
    let workspace_path = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.workspace_path
            .clone()
            .ok_or_else(|| AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "No workspace path configured for this bot",
            )))?
    };

    let base = PathBuf::from(&workspace_path);
    let target = if let Some(ref sub) = path {
        base.join(sub)
    } else {
        base.clone()
    };

    // Path traversal protection: ensure resolved path is within workspace
    let canonical_base = base.canonicalize().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Workspace path not found: {}", e),
        ))
    })?;
    let canonical_target = target.canonicalize().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Path not found: {}", e),
        ))
    })?;

    if !canonical_target.starts_with(&canonical_base) {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Path traversal not allowed",
        )));
    }

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&canonical_target).await?;

    while let Some(entry) = dir.next_entry().await? {
        let metadata = entry.metadata().await?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        let relative_path = if let Some(ref sub) = path {
            format!("{}/{}", sub, name)
        } else {
            name.clone()
        };

        entries.push(FileEntry {
            name,
            path: relative_path,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub async fn read_workspace_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> Result<String, AppError> {
    let workspace_path = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.workspace_path
            .clone()
            .ok_or_else(|| AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "No workspace path configured for this bot",
            )))?
    };

    let base = PathBuf::from(&workspace_path);
    let target = base.join(&path);

    // Path traversal protection
    let canonical_base = base.canonicalize()?;
    let canonical_target = target.canonicalize()?;

    if !canonical_target.starts_with(&canonical_base) {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Path traversal not allowed",
        )));
    }

    // Size limit: 1MB
    let metadata = tokio::fs::metadata(&canonical_target).await?;
    if metadata.len() > 1_048_576 {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "File too large (max 1MB)",
        )));
    }

    let content = tokio::fs::read_to_string(&canonical_target).await?;
    Ok(content)
}

// ── Bot config commands ───────────────────────────────────────────

#[tauri::command]
pub async fn get_bot_config(
    state: State<'_, AppState>,
    id: String,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    // Verify bot exists
    {
        let store = state.store.lock().await;
        store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
    }

    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("clawpier")
        .join("data")
        .join(&id);

    let mut configs = std::collections::HashMap::new();

    if !config_dir.exists() {
        return Ok(configs);
    }

    let canonical_config_dir = config_dir.canonicalize().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Config dir not found: {}", e),
        ))
    })?;

    let mut entries = tokio::fs::read_dir(&config_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        // Use symlink_metadata to detect symlinks without following them.
        let sym_meta = tokio::fs::symlink_metadata(&path).await?;
        if sym_meta.is_symlink() {
            // Reject symlinks — a container could place one pointing to /etc/passwd
            continue;
        }
        if sym_meta.is_file() {
            // Canonicalize and verify the file stays within the config directory
            if let Ok(canonical_path) = path.canonicalize() {
                if !canonical_path.starts_with(&canonical_config_dir) {
                    continue;
                }
            } else {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            // Only read text files up to 1MB
            if sym_meta.len() <= 1_048_576 {
                if let Ok(content) = tokio::fs::read_to_string(&path).await {
                    configs.insert(name, content);
                }
            }
        }
    }

    Ok(configs)
}

/// Info returned from the Telegram Bot API `getMe` endpoint.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TelegramBotInfo {
    pub id: i64,
    pub first_name: String,
    pub username: Option<String>,
    pub is_bot: bool,
}

#[tauri::command]
pub async fn resolve_telegram_bot(
    state: State<'_, AppState>,
    id: String,
) -> Result<TelegramBotInfo, AppError> {
    // Read bot token from openclaw.json
    let config_dir = {
        let store = state.store.lock().await;
        store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clawpier")
            .join("data")
            .join(&id)
    };

    let config_path = config_dir.join("openclaw.json");
    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|_| AppError::Other("No openclaw.json found".into()))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| AppError::Other(e.to_string()))?;

    let bot_token = json
        .pointer("/channels/telegram/botToken")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| AppError::Other("No Telegram bot token configured".into()))?;

    // Call Telegram Bot API getMe
    let url = format!("https://api.telegram.org/bot{}/getMe", bot_token);
    let resp: serde_json::Value = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Other(format!("Telegram API request failed: {}", e)))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Other(format!("Telegram API response parse error: {}", e)))?;

    if resp.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        let desc = resp
            .get("description")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Unknown error");
        return Err(AppError::Other(format!("Telegram API error: {}", desc)));
    }

    let result = resp
        .get("result")
        .ok_or_else(|| AppError::Other("Missing result in Telegram response".into()))?;

    Ok(TelegramBotInfo {
        id: result.get("id").and_then(serde_json::Value::as_i64).unwrap_or(0),
        first_name: result
            .get("first_name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        username: result
            .get("username")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
        is_bot: result
            .get("is_bot")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
    })
}

// ── Interactive terminal commands ──────────────────────────────────

#[tauri::command]
pub async fn start_terminal_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    // Acquire the streams lock upfront to avoid a check-then-act race.
    // If a session already exists, start_session will cleanly abort the old one.
    let container_name = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        bot.container_name()
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    // Create exec instance with TTY
    let exec_config = CreateExecOptions {
        attach_stdin: Some(true),
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        tty: Some(true),
        cmd: Some(vec!["/bin/bash".to_string()]),
        env: Some(vec![
            "TERM=xterm-256color".to_string(),
            "PS1=\\u@\\h:\\w\\$ ".to_string(),
        ]),
        ..Default::default()
    };

    let exec_created = docker.create_exec(&container_name, exec_config).await?;
    let exec_id = exec_created.id.clone();

    // Start exec and get attached streams
    let start_result = docker.start_exec(&exec_created.id, None).await?;

    match start_result {
        StartExecResults::Attached { output, input } => {
            // Resize to initial dimensions
            let resize_opts = ResizeExecOptions {
                width: cols,
                height: rows,
            };
            let _ = docker.resize_exec(&exec_id, resize_opts).await;

            // Wrap the stdin writer in Arc<Mutex<...>> for shared access
            let input_writer: Arc<TokioMutex<Pin<Box<dyn tokio::io::AsyncWrite + Send>>>> =
                Arc::new(TokioMutex::new(input));

            // Spawn output streaming task
            let bot_id = id.clone();
            let event_name = format!("terminal-output-{}", id);
            let disconnect_event = format!("terminal-disconnect-{}", id);
            let output_task = tauri::async_runtime::spawn(async move {
                let mut stream = output;
                while let Some(Ok(msg)) = stream.next().await {
                    // In TTY mode, bollard sends all output as StdOut
                    let bytes = match msg {
                        bollard::container::LogOutput::StdOut { message } => message,
                        bollard::container::LogOutput::StdErr { message } => message,
                        bollard::container::LogOutput::Console { message } => message,
                        _ => continue,
                    };
                    // Send raw bytes as a string (terminal handles encoding)
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    if !text.is_empty() {
                        let _ = app.emit(&event_name, &text);
                    }
                }
                // Stream ended (container stopped, exec died, etc.)
                let _ = app.emit(&disconnect_event, "stream_ended");
            });

            // Store the session
            let session = InteractiveSession {
                input: input_writer,
                output_task,
                exec_id,
            };

            let mut streams = state.streams.lock().await;
            streams.start_session(&bot_id, session);

            Ok(())
        }
        StartExecResults::Detached => {
            Err(AppError::Other("Exec started in detached mode unexpectedly".to_string()))
        }
    }
}

#[tauri::command]
pub async fn write_terminal_input(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> Result<(), AppError> {
    // Clone the Arc'd writer, releasing the StreamManager lock quickly
    let writer = {
        let streams = state.streams.lock().await;
        streams.get_session_input(&id)
    };

    let writer = writer.ok_or_else(|| {
        AppError::Other(format!("No active terminal session for bot {}", id))
    })?;

    // Lock the writer and send data
    let mut w = writer.lock().await;
    w.write_all(data.as_bytes())
        .await
        .map_err(|e| AppError::Other(format!("Failed to write to terminal: {}", e)))?;
    w.flush()
        .await
        .map_err(|e| AppError::Other(format!("Failed to flush terminal: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let exec_id = {
        let streams = state.streams.lock().await;
        streams.get_exec_id(&id)
    };

    let exec_id = exec_id.ok_or_else(|| {
        AppError::Other(format!("No active terminal session for bot {}", id))
    })?;

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let resize_opts = ResizeExecOptions {
        width: cols,
        height: rows,
    };

    docker
        .resize_exec(&exec_id, resize_opts)
        .await
        .map_err(|e| AppError::Other(format!("Failed to resize terminal: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_system_resources_returns_nonzero() {
        let res = get_system_resources();
        assert!(res.cpu_cores > 0, "CPU cores must be > 0");
        assert!(res.memory_bytes > 0, "Memory bytes must be > 0");
    }

    #[test]
    fn system_resources_serializable() {
        let res = get_system_resources();
        let json = serde_json::to_value(&res).unwrap();
        assert!(json["cpu_cores"].is_number());
        assert!(json["memory_bytes"].is_number());
    }
}
