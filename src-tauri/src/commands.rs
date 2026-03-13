use std::path::PathBuf;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, State};

use crate::docker_manager::{self, DockerManager};
use crate::error::AppError;
use crate::models::{BotProfile, BotStatus, BotWithStatus, EnvVar, ExecResult, FileEntry};
use crate::state::AppState;
use crate::streaming::StreamKind;

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
) -> Result<BotProfile, AppError> {
    let mut store = state.store.lock().await;
    let bot = BotProfile::new(name, workspace_path);
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
    // Stop any active streams for this bot
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
    drop(streams);

    let docker = state.docker.lock().await;
    docker.stop_bot(&id).await
}

#[tauri::command]
pub async fn delete_bot(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    // Stop streams
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
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
pub async fn pull_image(state: State<'_, AppState>, image: String) -> Result<(), AppError> {
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
    let mut store = state.store.lock().await;
    store.update_env_vars(&id, env_vars)
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
            if !entry.message.is_empty() {
                let _ = app.emit(&event_name, &entry);
            }
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
    command: String,
) -> Result<ExecResult, AppError> {
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

    DockerManager::exec_in_container(&docker, &container_name, &command).await
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
