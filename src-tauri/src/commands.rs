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
    AgentType, BotNotificationPrefs, BotProfile, BotStatus, BotWithStatus, ChatMessage,
    ChatResponseChunk, ChatSessionSummary, EnvVar, ExecResult, FileEntry, HealthCheckConfig,
    HealthUpdate, NetworkMode, PortMapping,
};
use crate::state::AppState;
use crate::streaming::{InteractiveSession, StreamKind};

// ── Chat command helpers ─────────────────────────────────────────────

/// Build the CLI arguments for an agent chat command with session persistence.
/// Separated from the Tauri command so it can be unit-tested.
pub(crate) fn build_agent_chat_cmd(agent_type: &AgentType, session_id: &str, message: &str) -> Vec<String> {
    match agent_type {
        AgentType::OpenClaw => {
            let oc_session_id = format!("clawpier-{}", session_id);
            vec![
                "/usr/local/bin/openclaw".to_string(),
                "agent".to_string(),
                "--local".to_string(),
                "--agent".to_string(),
                "main".to_string(),
                "--session-id".to_string(),
                oc_session_id,
                "--message".to_string(),
                message.to_string(),
            ]
        }
        AgentType::Hermes => {
            vec![
                "hermes".to_string(),
                "chat".to_string(),
                "-Q".to_string(),
                "-q".to_string(),
                message.to_string(),
            ]
        }
    }
}

/// Strip Hermes CLI metadata from one-shot (`-q`) output.
/// Removes the box-drawing header (e.g. `╭─ ⚕ Hermes ───…╮`) and
/// trailing `session_id: …` line.
pub(crate) fn strip_hermes_metadata(raw: &str) -> String {
    let mut lines: Vec<&str> = raw.lines().collect();

    // Remove leading header and blank lines.
    // Hermes wraps agent name in box-drawing: ╭─ ⚕ Hermes ───╮
    while let Some(first) = lines.first() {
        let trimmed = first.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('\u{256D}') // ╭ box-drawing upper-left
            || trimmed.starts_with('\u{2502}') // │ box-drawing vertical
            || trimmed.starts_with('\u{2570}') // ╰ box-drawing lower-left
            || trimmed.starts_with("> ")
            || trimmed.starts_with('\u{2190}') // ←
        {
            lines.remove(0);
        } else {
            break;
        }
    }

    // Remove trailing session_id / box-drawing footer lines
    while let Some(last) = lines.last() {
        let trimmed = last.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("session_id:")
            || trimmed.starts_with('\u{2570}') // ╰
            || trimmed.starts_with('\u{256D}') // ╭
        {
            lines.pop();
        } else {
            break;
        }
    }
    lines.join("\n")
}

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
    "nousresearch/hermes-agent",
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
    for prefix in TRUSTED_REGISTRIES {
        if image.starts_with(prefix) {
            // For prefixes ending with '/', any sub-path is fine
            if prefix.ends_with('/') {
                return Ok(());
            }
            // For exact image names, ensure the match is precise
            // (next char must be ':' for tag, or exact match)
            if image.len() == prefix.len() || image.as_bytes()[prefix.len()] == b':' {
                return Ok(());
            }
        }
    }
    Err(AppError::Validation(format!(
        "Image '{}' is not from a trusted registry",
        image
    )))
}

// ── Port availability check ──────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct PortCheckResult {
    pub port: u16,
    pub available: bool,
}

/// Check whether a host port is available by attempting to bind to it.
#[tauri::command]
pub fn check_port_available(port: u16) -> PortCheckResult {
    let available = std::net::TcpListener::bind(("127.0.0.1", port)).is_ok();
    PortCheckResult { port, available }
}

/// Find the first available port in a range starting from `start`.
#[tauri::command]
pub fn suggest_port(start: u16) -> u16 {
    for p in start..=start.saturating_add(99).min(65535) {
        if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return p;
        }
    }
    start // fallback
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

// ── App info ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_app_version() -> Result<String, AppError> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

// ── Existing commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn check_docker(state: State<'_, AppState>) -> Result<bool, AppError> {
    let docker = state.docker.lock().await;
    docker.check_docker().await
}

#[tauri::command]
pub async fn check_docker_health(state: State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.is_docker_connected())
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
    agent_type: Option<AgentType>,
) -> Result<BotProfile, AppError> {
    if let Some(ref path) = workspace_path {
        validate_workspace_path(path)?;
    }
    validate_resource_limits(cpu_limit, memory_limit)?;
    let mut store = state.store.lock().await;
    let mut bot = BotProfile::with_agent_type(name, workspace_path, agent_type.unwrap_or_default());
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
pub async fn start_bot(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let bot = store
        .get_by_id(&id)
        .ok_or_else(|| AppError::BotNotFound(id.clone()))?
        .clone();
    drop(store);

    let docker = state.docker.lock().await;
    docker.start_bot(&bot).await?;
    drop(docker);

    // Spawn health check task if configured
    if let Some(ref hc_config) = bot.health_check {
        let handle = spawn_health_check(
            app.clone(),
            bot.id.clone(),
            bot.container_name(),
            hc_config.clone(),
        );
        let mut streams = state.streams.lock().await;
        streams.start(&bot.id, StreamKind::Health, handle);
    }

    Ok(())
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
    // Phase 1: Stopping
    let _ = app.emit(&format!("bot-restart-phase-{}", id), "stopping");

    // Clean up streams and terminal session
    let mut streams = state.streams.lock().await;
    streams.stop_all(&id);
    streams.stop_session(&id);
    drop(streams);

    // Stop and remove the container with a 15-second timeout warning
    let docker = state.docker.lock().await;
    let stop_start = std::time::Instant::now();
    let _ = docker.stop_bot(&id).await;
    let stop_elapsed = stop_start.elapsed();
    if stop_elapsed.as_secs() > 15 {
        eprintln!(
            "[warn] Stopping bot {} took {:.1}s (exceeded 15s threshold)",
            id,
            stop_elapsed.as_secs_f64()
        );
    }
    drop(docker);

    // Phase 2: Stopped
    let _ = app.emit(&format!("bot-restart-phase-{}", id), "stopped");

    // Re-read the profile and start a fresh container
    let store = state.store.lock().await;
    let bot = store
        .get_by_id(&id)
        .ok_or_else(|| AppError::BotNotFound(id.clone()))?
        .clone();
    drop(store);

    // Phase 3: Starting
    let _ = app.emit(&format!("bot-restart-phase-{}", id), "starting");

    let docker = state.docker.lock().await;
    docker.start_bot(&bot).await?;
    drop(docker);

    // Phase 4: Running
    let _ = app.emit(&format!("bot-restart-phase-{}", id), "running");

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
pub async fn set_auto_start(
    state: State<'_, AppState>,
    id: String,
    auto_start: bool,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    store.set_auto_start(&id, auto_start)
}

#[tauri::command]
pub async fn auto_start_bots(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    let store = state.store.lock().await;
    let bots = store.get_auto_start_bots();
    drop(store);

    let mut errors: Vec<String> = Vec::new();

    for (i, bot) in bots.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        let docker = state.docker.lock().await;
        if let Err(e) = docker.start_bot(bot).await {
            errors.push(format!("{}: {}", bot.name, e));
        }
    }

    Ok(errors)
}

// ── Health check commands ─────────────────────────────────────────────

#[tauri::command]
pub async fn update_health_check(
    state: State<'_, AppState>,
    id: String,
    health_check: Option<HealthCheckConfig>,
) -> Result<(), AppError> {
    // Validate if present
    if let Some(ref hc) = health_check {
        if hc.command.is_empty() || hc.command.iter().all(|s| s.trim().is_empty()) {
            return Err(AppError::Validation(
                "Health check command must not be empty".into(),
            ));
        }
        if hc.interval_secs < 5 {
            return Err(AppError::Validation(
                "Health check interval must be at least 5 seconds".into(),
            ));
        }
        if hc.retries < 1 {
            return Err(AppError::Validation(
                "Health check retries must be at least 1".into(),
            ));
        }
    }

    let mut store = state.store.lock().await;
    store.update_health_check(&id, health_check)
}

// ── Notification preferences commands ────────────────────────────────

#[tauri::command]
pub async fn update_notification_prefs(
    state: State<'_, AppState>,
    id: String,
    prefs: Option<BotNotificationPrefs>,
) -> Result<(), AppError> {
    let mut store = state.store.lock().await;
    store.update_notification_prefs(&id, prefs)
}

/// Spawn a background health check task for a running bot.
/// The task periodically execs the health check command in the container,
/// tracks consecutive failures, emits events, and optionally auto-restarts.
pub(crate) fn spawn_health_check(
    app: AppHandle,
    bot_id: String,
    container_name: String,
    config: HealthCheckConfig,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut consecutive_failures: u32 = 0;

        // Wait one interval before the first check (let the bot settle)
        tokio::time::sleep(std::time::Duration::from_secs(config.interval_secs)).await;

        loop {
            let state: tauri::State<'_, AppState> = app.state::<AppState>();
            let docker = state.docker.lock().await;
            let docker_client = docker.client();

            let args: Vec<&str> = config.command.iter().map(|s| s.as_str()).collect();
            let result =
                DockerManager::exec_in_container(&docker_client, &container_name, &args).await;
            drop(docker);

            let (healthy, output) = match result {
                Ok(exec_result) => {
                    let ok = exec_result.exit_code == Some(0);
                    (ok, Some(exec_result.output))
                }
                Err(_) => (false, None),
            };

            if healthy {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
            }

            let update = HealthUpdate {
                bot_id: bot_id.clone(),
                healthy: consecutive_failures == 0,
                consecutive_failures,
                last_output: output,
            };
            let _ = app.emit("bot-health-update", &update);

            // Auto-restart on threshold
            if consecutive_failures >= config.retries && config.auto_restart {
                eprintln!(
                    "Health check: {} failed {} times, auto-restarting",
                    bot_id, consecutive_failures
                );

                // Stop streams (health check will be re-spawned after restart)
                {
                    let mut streams = state.streams.lock().await;
                    streams.stop_all(&bot_id);
                    streams.stop_session(&bot_id);
                }

                // Restart the container
                let restart_result = {
                    let docker = state.docker.lock().await;
                    docker.stop_bot(&bot_id).await.ok();
                    let store = state.store.lock().await;
                    if let Some(bot) = store.get_by_id(&bot_id) {
                        let bot = bot.clone();
                        drop(store);
                        docker.start_bot(&bot).await
                    } else {
                        break; // Bot was deleted
                    }
                };

                if let Err(e) = restart_result {
                    eprintln!("Health check auto-restart failed for {}: {}", bot_id, e);
                }

                // Exit this task — a new health check will be spawned by the
                // next status poll or manual start
                break;
            }

            tokio::time::sleep(std::time::Duration::from_secs(config.interval_secs)).await;
        }
    })
}

// ── ClawHub skill commands ─────────────────────────────────────────────

/// Validate a skill name — alphanumeric, hyphens, underscores, slashes (scoped packages).
fn validate_skill_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::Validation("Skill name must not be empty".into()));
    }
    // Reject path traversal
    if name.contains("..") {
        return Err(AppError::Validation(format!(
            "Invalid skill name: '{}'",
            name
        )));
    }
    // Allow @scope/name patterns plus alphanumeric, hyphens, underscores, dots
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || "-_./@ ".contains(c))
    {
        return Err(AppError::Validation(format!(
            "Invalid skill name: '{}'",
            name
        )));
    }
    Ok(())
}

/// Helper: resolve container name AND agent type for a bot.
fn resolve_container_and_agent(
    store: &crate::bot_store::BotStore,
    id: &str,
) -> Result<(String, AgentType), AppError> {
    let bot = store
        .get_by_id(id)
        .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;
    Ok((bot.container_name(), bot.agent_type.clone()))
}

/// Parse `openclaw skills list` table output into Skill structs.
/// Rows: `│ ✓ ready │ 📦 name │ description │ source │`
fn parse_openclaw_skills_output(output: &str) -> Vec<crate::models::Skill> {
    let mut seen = std::collections::HashSet::new();
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if !line.starts_with('│') || line.starts_with("│ Status") {
                return None;
            }
            let cells: Vec<&str> = line.split('│').map(|s| s.trim()).collect();
            if cells.len() < 5 {
                return None;
            }
            let status = cells[1].trim();
            let raw_name = cells[2].trim();
            let description = cells[3].trim().to_string();
            let source = cells[4].trim().to_string();

            if status.contains("Status") || status.contains("───") {
                return None;
            }

            let installed = status.contains('✓');
            let name = raw_name
                .chars()
                .skip_while(|c| !c.is_ascii_alphanumeric())
                .collect::<String>()
                .trim()
                .to_string();

            if name.is_empty() || !seen.insert(name.clone()) {
                return None;
            }

            Some(crate::models::Skill {
                name,
                description,
                author: source,
                version: String::new(),
                installed,
                source: "bundled".to_string(),
            })
        })
        .collect()
}

/// Parse `hermes skills list` output into Skill structs.
///
/// Unlike OpenClaw (which shows ✓/✗ for ready/missing), Hermes `skills list`
/// only returns **installed** skills. If a skill appears in the output, it is
/// ready. Available-but-not-installed skills are shown via `hermes skills browse`.
///
/// The Hermes CLI uses Python Rich tables with box-drawing characters.
/// `hermes skills list` outputs columns: Name │ Category │ Source │ Trust
/// All skills listed are installed (bundled, hub, or local).
fn parse_hermes_skills_output(output: &str) -> Vec<crate::models::Skill> {
    parse_rich_table(output, |cells| {
        // Columns: Name, Category, Source, Trust
        let name = cells[0].to_string();
        let category = cells.get(1).copied().unwrap_or("");
        let source_col = cells.get(2).copied().unwrap_or("");
        // Map Hermes source types to our source field
        let source = if source_col.contains("hub") || source_col == "official" {
            "hermes-hub"
        } else {
            "bundled"
        };
        Some(crate::models::Skill {
            name,
            description: if category.is_empty() {
                String::new()
            } else {
                format!("[{}]", category)
            },
            author: source_col.to_string(),
            version: String::new(),
            installed: true,
            source: source.to_string(),
        })
    })
}

/// Parse a Rich-formatted table (box-drawing chars like │ ┌ ─ ┐).
/// Calls `row_fn` for each data row with the non-empty cells.
fn parse_rich_table<F>(output: &str, row_fn: F) -> Vec<crate::models::Skill>
where
    F: Fn(&[&str]) -> Option<crate::models::Skill>,
{
    let mut seen = std::collections::HashSet::new();
    let mut header_seen = false;

    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            // Skip empty lines and decorative borders
            if line.is_empty()
                || line.starts_with('┌')
                || line.starts_with('└')
                || line.starts_with('├')
                || line.starts_with('╭')
                || line.starts_with('╰')
                || line.starts_with('╞')
            {
                return None;
            }
            // Must be a table row with │ delimiters
            if !line.contains('│') {
                return None;
            }
            let cells: Vec<&str> = line.split('│')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if cells.is_empty() {
                return None;
            }
            // Skip header row (first row with │ delimiters)
            if !header_seen {
                header_seen = true;
                return None;
            }
            // Strip ANSI escape codes from cells
            let cleaned: Vec<String> = cells.iter()
                .map(|c| strip_ansi(c))
                .collect();
            let cleaned_refs: Vec<&str> = cleaned.iter().map(|s| s.as_str()).collect();

            let skill = row_fn(&cleaned_refs)?;
            if skill.name.is_empty() || !seen.insert(skill.name.clone()) {
                return None;
            }
            Some(skill)
        })
        .collect()
}

/// Strip ANSI escape sequences (Rich terminal colors) from a string.
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip until 'm' (end of ANSI escape)
            for inner in chars.by_ref() {
                if inner == 'm' {
                    break;
                }
            }
        } else {
            result.push(c);
        }
    }
    result.trim().to_string()
}

/// Parse `hermes skills search` / `hermes skills browse` Rich table output.
/// Columns: # │ Name │ Description │ Source │ Trust
fn parse_hermes_search_output(output: &str) -> Vec<crate::models::Skill> {
    parse_rich_table(output, |cells| {
        // The browse output has a "#" column first; search does not.
        // Detect by checking if first cell is numeric.
        let offset = if cells[0].chars().all(|c| c.is_ascii_digit()) { 1 } else { 0 };
        let name = cells.get(offset)?.to_string();
        let description = cells.get(offset + 1).map(|s| s.to_string()).unwrap_or_default();
        if name.is_empty() {
            return None;
        }
        Some(crate::models::Skill {
            name,
            description,
            author: String::new(),
            version: String::new(),
            installed: false,
            source: "hermes-hub".to_string(),
        })
    })
}

/// Parse `npx clawhub search` text output into Skill structs.
/// Each line: `slug  Title  (score)`
fn parse_clawhub_search_output(output: &str) -> Vec<crate::models::Skill> {
    let mut seen = std::collections::HashSet::new();
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with('-')
                || line.starts_with("npm ")
                || line.starts_with("error")
            {
                return None;
            }
            let parts: Vec<&str> = line.splitn(2, "  ").collect();
            if parts.len() < 2 {
                return None;
            }
            let slug = parts[0].trim().to_string();
            if slug.is_empty() || !seen.insert(slug.clone()) {
                return None;
            }
            let rest = parts[1].trim();
            let description = if let Some(paren_pos) = rest.rfind('(') {
                rest[..paren_pos].trim().to_string()
            } else {
                rest.to_string()
            };

            Some(crate::models::Skill {
                name: slug,
                description,
                author: String::new(),
                version: String::new(),
                installed: false,
                source: "clawhub".to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn clawhub_search_skills(
    state: State<'_, AppState>,
    id: String,
    query: String,
) -> Result<crate::models::SkillSearchResult, AppError> {
    use crate::models::SkillSearchResult;

    let (container_name, bot_agent_type) = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        (bot.container_name(), bot.agent_type.clone())
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let timeout_dur = std::time::Duration::from_secs(30);

    if query.trim().is_empty() {
        // No query: list all bundled skills
        let args = match bot_agent_type {
            AgentType::OpenClaw => vec!["openclaw", "skills", "list"],
            AgentType::Hermes => vec!["hermes", "skills", "list"],
        };
        let result = tokio::time::timeout(
            timeout_dur,
            DockerManager::exec_in_container(&docker, &container_name, &args),
        )
        .await
        .map_err(|_| AppError::Validation("Skill listing timed out. Try again later.".into()))?;

        match result {
            Ok(exec_result) => {
                let skills = match bot_agent_type {
                    AgentType::OpenClaw => parse_openclaw_skills_output(&exec_result.output),
                    AgentType::Hermes => parse_hermes_skills_output(&exec_result.output),
                };
                let total = skills.len() as u32;
                Ok(SkillSearchResult { skills, total })
            }
            Err(_) => Err(AppError::Validation(
                "Could not list skills. Is the bot running?".into(),
            )),
        }
    } else {
        // Search skill registry
        let args = match bot_agent_type {
            AgentType::OpenClaw => vec!["npx", "--yes", "clawhub", "search", &query, "--limit", "20"],
            AgentType::Hermes => vec!["hermes", "skills", "search", &query],
        };
        let result = tokio::time::timeout(
            timeout_dur,
            DockerManager::exec_in_container(&docker, &container_name, &args),
        )
        .await
        .map_err(|_| AppError::Validation("Skill search timed out.".into()))?;

        match result {
            Ok(exec_result) => {
                if exec_result.exit_code == Some(127) {
                    return Err(AppError::Validation(
                        "Skill search CLI is not available in this container.".into(),
                    ));
                }
                let skills = match bot_agent_type {
                    AgentType::OpenClaw => parse_clawhub_search_output(&exec_result.output),
                    AgentType::Hermes => parse_hermes_search_output(&exec_result.output),
                };
                let total = skills.len() as u32;
                Ok(SkillSearchResult { skills, total })
            }
            Err(_) => Err(AppError::Validation(
                "ClawHub search failed. The container may not have network access.".into(),
            )),
        }
    }
}

#[tauri::command]
pub async fn check_clawhub_available(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, AppError> {
    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };

    // Hermes has native skill support — no external CLI needed
    if agent_type == AgentType::Hermes {
        return Ok("hermes-native".to_string());
    }

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let args = vec!["npx", "--yes", "clawhub", "--cli-version"];
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        DockerManager::exec_in_container(&docker, &container_name, &args),
    )
    .await
    .map_err(|_| AppError::Validation("Check timed out".into()))?;

    match result {
        Ok(exec_result) => {
            let version = exec_result.output.trim().to_string();
            if version.is_empty() || exec_result.exit_code == Some(127) {
                Err(AppError::Validation("ClawHub CLI is not installed".into()))
            } else {
                Ok(version)
            }
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn install_clawhub(
    state: State<'_, AppState>,
    id: String,
) -> Result<ExecResult, AppError> {
    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };

    // Hermes has native skill support — no external CLI to install
    if agent_type == AgentType::Hermes {
        return Ok(ExecResult {
            output: "Hermes has native skill support".to_string(),
            exit_code: Some(0),
        });
    }

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let args = vec!["npm", "install", "-g", "clawhub"];
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        DockerManager::exec_in_container(&docker, &container_name, &args),
    )
    .await
    .map_err(|_| AppError::Validation("Install timed out".into()))?;

    result
}

#[tauri::command]
pub async fn clawhub_inspect_skill(
    state: State<'_, AppState>,
    id: String,
    skill_name: String,
) -> Result<String, AppError> {
    validate_skill_name(&skill_name)?;

    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };
    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    match agent_type {
        AgentType::OpenClaw => {
            // OpenClaw: use npx clawhub inspect for registry metadata
            let args = vec!["npx", "--yes", "clawhub", "inspect", &skill_name, "--json"];
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                DockerManager::exec_in_container(&docker, &container_name, &args),
            )
            .await
            .map_err(|_| AppError::Validation("Inspect timed out".into()))?;

            match result {
                Ok(exec_result) => {
                    let output = exec_result.output.trim();
                    if let Some(json_start) = output.find('{') {
                        Ok(output[json_start..].to_string())
                    } else {
                        Ok(output.to_string())
                    }
                }
                Err(e) => Err(e),
            }
        }
        AgentType::Hermes => {
            // Hermes: read SKILL.md frontmatter directly from the skills directory.
            // `hermes skills inspect` expects a full source path (e.g. official/foo),
            // not a bare name, so we read the file directly for installed skills.
            let script = format!(
                r#"
f="$HOME/.hermes/skills/{skill}/SKILL.md"
if [ ! -f "$f" ]; then
  # Try finding the skill in subdirectories (skills can be nested by category)
  f=$(find "$HOME/.hermes/skills" -maxdepth 3 -name "SKILL.md" -path "*/{skill}/SKILL.md" 2>/dev/null | head -1)
fi
if [ -z "$f" ] || [ ! -f "$f" ]; then
  echo '{{"error":"not found"}}'
  exit 0
fi
# Extract YAML frontmatter between --- markers and convert to JSON-like output
awk '/^---$/{{if(n++)exit;next}}n' "$f" | head -30
"#,
                skill = skill_name
            );
            let args = vec!["sh", "-c", &script];
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                DockerManager::exec_in_container(&docker, &container_name, &args),
            )
            .await
            .map_err(|_| AppError::Validation("Inspect timed out".into()))?;

            match result {
                Ok(exec_result) => {
                    let output = exec_result.output.trim();
                    // Build a JSON response from the YAML frontmatter fields
                    // Parse simple key: value lines
                    let mut name = skill_name.clone();
                    let mut description = String::new();
                    let mut version = String::new();
                    let mut category = String::new();
                    for line in output.lines() {
                        let line = line.trim();
                        if let Some(val) = line.strip_prefix("name:") {
                            name = val.trim().trim_matches('"').trim_matches('\'').to_string();
                        } else if let Some(val) = line.strip_prefix("description:") {
                            description = val.trim().trim_matches('"').trim_matches('\'').to_string();
                        } else if let Some(val) = line.strip_prefix("version:") {
                            version = val.trim().trim_matches('"').trim_matches('\'').to_string();
                        } else if let Some(val) = line.strip_prefix("category:") {
                            category = val.trim().trim_matches('"').trim_matches('\'').to_string();
                        }
                    }
                    let json = serde_json::json!({
                        "skill": {
                            "slug": skill_name,
                            "displayName": name,
                            "summary": description,
                        },
                        "latestVersion": {
                            "version": version,
                        },
                        "owner": {
                            "handle": if category.is_empty() { "hermes-bundled" } else { &category },
                        }
                    });
                    Ok(json.to_string())
                }
                Err(e) => Err(e),
            }
        }
    }
}

/// Get missing dependencies for a skill by reading its SKILL.md frontmatter
/// and checking which required binaries/env vars/config are available.
/// Returns JSON: `{ "bins": ["gh"], "env": ["API_KEY"], "config": ["channels.slack"], "os": ["darwin"] }`
#[tauri::command]
pub async fn get_skill_requirements(
    state: State<'_, AppState>,
    id: String,
    skill_name: String,
) -> Result<serde_json::Value, AppError> {
    validate_skill_name(&skill_name)?;

    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };
    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    // Skill metadata path differs by agent type:
    //   OpenClaw: /app/skills/{skill}/SKILL.md
    //   Hermes:   ~/.hermes/skills/{skill}/SKILL.md (per Hermes docs)
    let skills_base = match agent_type {
        AgentType::OpenClaw => "/app/skills".to_string(),
        AgentType::Hermes => "$HOME/.hermes/skills".to_string(),
    };

    // Shell script that:
    // 1. Reads the requires / required_environment_variables from SKILL.md frontmatter
    // 2. Checks which bins are missing via `command -v`
    // 3. Checks which env vars are unset
    // 4. Outputs JSON
    let script = format!(
        r#"
f="{skills_base}/{skill}/SKILL.md"
if [ ! -f "$f" ]; then echo '{{"error":"not found"}}'; exit 0; fi

# Extract requires block
req=$(grep -oP '"requires":\s*\{{[^{{}}]*\}}' "$f" 2>/dev/null | head -1)
if [ -z "$req" ]; then echo '{{"all_met":true}}'; exit 0; fi

missing_bins=""
missing_env=""
missing_config=""
required_os=""

# Check bins
bins=$(echo "$req" | grep -oP '"bins":\s*\[[^\]]*\]' | grep -oP '"[^"]*"' | tr -d '"')
for b in $bins; do
  command -v "$b" >/dev/null 2>&1 || missing_bins="$missing_bins\"$b\","
done

# Check anyBins (need at least one)
any_bins=$(echo "$req" | grep -oP '"anyBins":\s*\[[^\]]*\]' | grep -oP '"[^"]*"' | tr -d '"')
if [ -n "$any_bins" ]; then
  found=0
  for b in $any_bins; do
    command -v "$b" >/dev/null 2>&1 && found=1 && break
  done
  if [ $found -eq 0 ]; then
    all_str=""
    for b in $any_bins; do all_str="$all_str\"$b\","; done
    missing_bins="$missing_bins$all_str"
  fi
fi

# Check env
envs=$(echo "$req" | grep -oP '"env":\s*\[[^\]]*\]' | grep -oP '"[^"]*"' | tr -d '"')
for e in $envs; do
  eval "val=\$$e"
  [ -z "$val" ] && missing_env="$missing_env\"$e\","
done

# Check config
configs=$(echo "$req" | grep -oP '"config":\s*\[[^\]]*\]' | grep -oP '"[^"]*"' | tr -d '"')
for c in $configs; do
  missing_config="$missing_config\"$c\","
done

# Check OS
os=$(echo "$req" | grep -oP '"os":\s*"[^"]*"' | grep -oP '"[^"]*"$' | tr -d '"')
[ -n "$os" ] && required_os="\"$os\""

# Remove trailing commas and build JSON
missing_bins=$(echo "$missing_bins" | sed 's/,$//')
missing_env=$(echo "$missing_env" | sed 's/,$//')
missing_config=$(echo "$missing_config" | sed 's/,$//')

echo "{{\"bins\":[$missing_bins],\"env\":[$missing_env],\"config\":[$missing_config],\"os\":[$required_os]}}"
"#,
        skill = skill_name,
        skills_base = skills_base
    );

    let args = vec!["sh", "-c", &script];
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        DockerManager::exec_in_container(&docker, &container_name, &args),
    )
    .await
    .map_err(|_| AppError::Validation("Requirements check timed out".into()))?;

    match result {
        Ok(exec_result) => {
            let output = exec_result.output.trim();
            match serde_json::from_str::<serde_json::Value>(output) {
                Ok(val) => Ok(val),
                Err(_) => Ok(serde_json::json!({ "error": "Could not parse requirements" })),
            }
        }
        Err(_) => Ok(serde_json::json!({ "error": "Could not check requirements" })),
    }
}

#[tauri::command]
pub async fn clawhub_install_skill(
    state: State<'_, AppState>,
    id: String,
    skill_name: String,
) -> Result<ExecResult, AppError> {
    validate_skill_name(&skill_name)?;

    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let args = match agent_type {
        AgentType::OpenClaw => vec![
            "npx", "--yes", "clawhub", "install", &skill_name, "--no-input",
        ],
        AgentType::Hermes => vec!["hermes", "skills", "install", &skill_name],
    };
    DockerManager::exec_in_container(&docker, &container_name, &args).await
}

#[tauri::command]
pub async fn clawhub_uninstall_skill(
    state: State<'_, AppState>,
    id: String,
    skill_name: String,
) -> Result<ExecResult, AppError> {
    validate_skill_name(&skill_name)?;

    let (container_name, agent_type) = {
        let store = state.store.lock().await;
        resolve_container_and_agent(&store, &id)?
    };

    let docker = {
        let dm = state.docker.lock().await;
        dm.client()
    };

    let args = match agent_type {
        AgentType::OpenClaw => vec![
            "npx", "--yes", "clawhub", "uninstall", &skill_name, "--no-input",
        ],
        AgentType::Hermes => vec!["hermes", "skills", "uninstall", &skill_name],
    };
    DockerManager::exec_in_container(&docker, &container_name, &args).await
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
pub async fn pull_image(
    app: AppHandle,
    state: State<'_, AppState>,
    image: String,
) -> Result<(), AppError> {
    validate_image_name(&image)?;
    // Clone the bollard client (cheap — Arc internally) and drop the mutex
    // so other Docker operations aren't blocked during the long-running pull.
    let client = {
        let docker = state.docker.lock().await;
        docker.client()
    };
    let event_name = format!("image-pull-progress-{}", image.replace(['/', ':'], "-"));
    DockerManager::pull_image_with_progress(&client, &image, |progress| {
        let _ = app.emit(&event_name, &progress);
    })
    .await
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

// ── Config backup/restore commands ────────────────────────────────────

#[tauri::command]
pub async fn export_config(state: State<'_, AppState>) -> Result<String, AppError> {
    let store = state.store.lock().await;
    let bots = store.get_all();
    serde_json::to_string_pretty(&bots).map_err(AppError::Json)
}

#[tauri::command]
pub async fn import_config(
    state: State<'_, AppState>,
    json: String,
) -> Result<Vec<BotWithStatus>, AppError> {
    let imported_bots: Vec<BotProfile> =
        serde_json::from_str(&json).map_err(AppError::Json)?;

    // Validate imported data
    for bot in &imported_bots {
        if bot.name.trim().is_empty() {
            return Err(AppError::Validation("Imported bot has empty name".into()));
        }
    }

    let mut store = state.store.lock().await;
    store.import_bots(imported_bots)?;

    // Return updated list with status
    let docker = state.docker.lock().await;
    let bot_ids = store.get_bot_ids();
    let statuses = docker.get_all_statuses(&bot_ids).await;

    let result: Vec<BotWithStatus> = store
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

    Ok(result)
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

    // Get container name, agent type, and docker client
    let (container_name, bot_agent_type) = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        (bot.container_name(), bot.agent_type.clone())
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

        // Use the appropriate agent CLI with session persistence.
        let cmd = crate::commands::build_agent_chat_cmd(&bot_agent_type, &sess_id, &message);
        let config = CreateExecOptions {
            attach_stdin: Some(false),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            cmd: Some(cmd),
            ..Default::default()
        };

        let mut response_content = String::new();
        let mut stderr_content = String::new();
        let mut got_stdout = false;

        match docker.create_exec(&container_name, config).await {
            Ok(created) => {
                match docker.start_exec(&created.id, None).await {
                    Ok(bollard::exec::StartExecResults::Attached {
                        output: mut stream,
                        ..
                    }) => {
                        let is_hermes = matches!(bot_agent_type, AgentType::Hermes);

                        // Stream stdout; collect stderr separately.
                        // Stderr is only shown if no stdout was received
                        // (i.e. a real error), to avoid gateway fallback
                        // warnings polluting the chat response.
                        while let Some(Ok(msg)) = stream.next().await {
                            match msg {
                                bollard::container::LogOutput::StdOut { message } => {
                                    let text = String::from_utf8_lossy(&message).to_string();
                                    if !text.is_empty() {
                                        got_stdout = true;
                                        response_content.push_str(&text);
                                        // For Hermes, buffer output and emit
                                        // after stripping CLI metadata.
                                        if !is_hermes {
                                            let chunk = ChatResponseChunk {
                                                session_id: sess_id.clone(),
                                                content: text,
                                                done: false,
                                            };
                                            let _ = app_handle.emit(&event_name, &chunk);
                                        }
                                    }
                                }
                                bollard::container::LogOutput::StdErr { message } => {
                                    stderr_content.push_str(
                                        &String::from_utf8_lossy(&message),
                                    );
                                }
                                _ => {}
                            }
                        }

                        // For Hermes, strip CLI metadata ("> Hermes"
                        // header, "session_id:" footer) then emit.
                        if is_hermes && got_stdout {
                            response_content = crate::commands::strip_hermes_metadata(&response_content);
                            if !response_content.is_empty() {
                                let chunk = ChatResponseChunk {
                                    session_id: sess_id.clone(),
                                    content: response_content.clone(),
                                    done: false,
                                };
                                let _ = app_handle.emit(&event_name, &chunk);
                            }
                        }

                        // If no stdout was received, show stderr as the
                        // response so the user can see what went wrong.
                        if !got_stdout && !stderr_content.is_empty() {
                            response_content = stderr_content;
                            let chunk = ChatResponseChunk {
                                session_id: sess_id.clone(),
                                content: response_content.clone(),
                                done: false,
                            };
                            let _ = app_handle.emit(&event_name, &chunk);
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
                    // Convert YAML files to JSON so the frontend gets a uniform format
                    if name.ends_with(".yaml") || name.ends_with(".yml") {
                        if let Ok(yaml_val) = serde_yaml::from_str::<serde_json::Value>(&content) {
                            if let Ok(json_str) = serde_json::to_string(&yaml_val) {
                                let json_name = name.replace(".yaml", ".json").replace(".yml", ".json");
                                configs.insert(json_name, json_str);
                            }
                        }
                    } else if name == ".env" {
                        // Parse .env into a JSON object for the dashboard
                        let env_obj = parse_dotenv_to_json(&content);
                        if let Ok(json_str) = serde_json::to_string(&env_obj) {
                            configs.insert("env.json".to_string(), json_str);
                        }
                    } else {
                        configs.insert(name, content);
                    }
                }
            }
        }
    }

    Ok(configs)
}

/// Parse a .env file into a JSON object (key-value map).
/// Handles `export` prefix, inline comments, and quoted values.
fn parse_dotenv_to_json(content: &str) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        if let Some((key, val)) = line.split_once('=') {
            let key = key.trim();
            let val = val.split('#').next().unwrap_or(val).trim();
            let val = val.trim_matches('"').trim_matches('\'');
            if !key.is_empty() {
                // Redact sensitive values (show only last 4 chars)
                let display_val = if key.contains("KEY") || key.contains("TOKEN") || key.contains("SECRET") {
                    if val.len() > 4 {
                        format!("{}...{}", &val[..2], &val[val.len()-4..])
                    } else {
                        "****".to_string()
                    }
                } else {
                    val.to_string()
                };
                map.insert(key.to_string(), serde_json::Value::String(display_val));
            }
        }
    }
    serde_json::Value::Object(map)
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
    // Read bot token based on agent type
    let (config_dir, bot_agent_type) = {
        let store = state.store.lock().await;
        let bot = store
            .get_by_id(&id)
            .ok_or_else(|| AppError::BotNotFound(id.clone()))?;
        let agent_type = bot.agent_type.clone();
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clawpier")
            .join("data")
            .join(&id);
        (dir, agent_type)
    };

    let bot_token = match bot_agent_type {
        AgentType::OpenClaw => {
            let config_path = config_dir.join("openclaw.json");
            let content = tokio::fs::read_to_string(&config_path)
                .await
                .map_err(|_| AppError::Other("No openclaw.json found".into()))?;

            let json: serde_json::Value =
                serde_json::from_str(&content).map_err(|e| AppError::Other(e.to_string()))?;

            json.pointer("/channels/telegram/botToken")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| AppError::Other("No Telegram bot token configured".into()))?
                .to_string()
        }
        AgentType::Hermes => {
            // Try .env file for TELEGRAM_BOT_TOKEN
            let env_path = config_dir.join(".env");
            let content = tokio::fs::read_to_string(&env_path)
                .await
                .map_err(|_| AppError::Other("No .env file found".into()))?;
            content.lines()
                .find_map(|line| {
                    let line = line.trim();
                    // Skip comments
                    if line.starts_with('#') { return None; }
                    // Strip optional `export ` prefix
                    let line = line.strip_prefix("export ").unwrap_or(line);
                    if let Some(val) = line.strip_prefix("TELEGRAM_BOT_TOKEN=") {
                        // Strip inline comments and surrounding quotes
                        let val = val.split('#').next().unwrap_or(val).trim();
                        Some(val.trim_matches('"').trim_matches('\'').to_string())
                    } else {
                        None
                    }
                })
                .ok_or_else(|| AppError::Other("No TELEGRAM_BOT_TOKEN in .env".into()))?
        }
    };

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
pub async fn stop_terminal_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    // Grab the exec ID before stopping the session
    let exec_id = {
        let streams = state.streams.lock().await;
        streams.get_exec_id(&id)
    };

    // Kill the exec's bash process inside the container by inspecting the exec
    // to find its PID, then sending a kill signal.
    if let Some(exec_id) = exec_id {
        let docker = {
            let dm = state.docker.lock().await;
            dm.client()
        };

        // Try to gracefully close by inspecting exec — if it's still running,
        // we need to kill the PID inside the container.
        if let Ok(inspect) = docker.inspect_exec(&exec_id).await {
            if let Some(pid) = inspect.pid {
                if pid > 0 {
                    // Get the container ID from the exec inspect
                    if let Some(ref container_id) = inspect.container_id {
                        let kill_cmd = CreateExecOptions {
                            attach_stdout: Some(false),
                            attach_stderr: Some(false),
                            cmd: Some(vec![
                                "kill".to_string(),
                                "-TERM".to_string(),
                                pid.to_string(),
                            ]),
                            ..Default::default()
                        };
                        // Best-effort kill — ignore errors (process may have already exited)
                        if let Ok(created) = docker.create_exec(container_id, kill_cmd).await {
                            let _ = docker.start_exec(&created.id, None).await;
                        }
                    }
                }
            }
        }
    }

    // Now clean up the session (aborts output task, drops input writer)
    let mut streams = state.streams.lock().await;
    streams.stop_session(&id);

    Ok(())
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

// ── Log export ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn export_logs(path: String, content: String) -> Result<(), AppError> {
    let path = std::path::PathBuf::from(&path);

    // Validate: parent directory must exist and be canonical
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Validation("Invalid export path".into()))?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|_| AppError::Validation("Export directory does not exist".into()))?;

    // Must be within user's home directory
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Cannot determine home directory".into()))?;
    if !canonical_parent.starts_with(&home) {
        return Err(AppError::Validation(
            "Export path must be within your home directory".into(),
        ));
    }

    // Block sensitive subdirectories within home
    let relative = canonical_parent
        .strip_prefix(&home)
        .unwrap_or(&canonical_parent);
    for sensitive in &[".ssh", ".gnupg"] {
        if relative.starts_with(sensitive) {
            return Err(AppError::Validation(
                "Cannot export to sensitive directory".into(),
            ));
        }
    }

    tokio::fs::write(&path, content)
        .await
        .map_err(AppError::Io)?;
    Ok(())
}

// ── Crash logging ────────────────────────────────────────────────────

#[tauri::command]
pub async fn log_crash(
    message: String,
    stack: String,
    component_stack: String,
) -> Result<(), AppError> {
    let dir = dirs::config_dir()
        .ok_or_else(|| AppError::Other("Cannot find config directory".into()))?
        .join("clawpier")
        .join("crash-logs");

    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("crash_{}.log", timestamp);
    let content = format!(
        "Crash Report - {}\n\nMessage: {}\n\nStack:\n{}\n\nComponent Stack:\n{}\n",
        chrono::Local::now().to_rfc3339(),
        message,
        stack,
        component_stack
    );

    std::fs::write(dir.join(filename), content).map_err(AppError::Io)?;
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

    // ── Chat / agent command tests ─────────────────────────────────

    #[test]
    fn build_agent_chat_cmd_openclaw_basic() {
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "session-abc", "Hello world");
        assert_eq!(cmd[0], "/usr/local/bin/openclaw");
        assert_eq!(cmd[1], "agent");
        assert_eq!(cmd[2], "--local");
        assert_eq!(cmd[3], "--agent");
        assert_eq!(cmd[4], "main");
        assert_eq!(cmd[5], "--session-id");
        assert_eq!(cmd[6], "clawpier-session-abc");
        assert_eq!(cmd[7], "--message");
        assert_eq!(cmd[8], "Hello world");
        assert_eq!(cmd.len(), 9);
    }

    #[test]
    fn build_agent_chat_cmd_hermes_basic() {
        let cmd = build_agent_chat_cmd(&AgentType::Hermes, "session-abc", "Hello world");
        assert_eq!(cmd[0], "hermes");
        assert_eq!(cmd[1], "chat");
        assert_eq!(cmd[2], "-Q");
        assert_eq!(cmd[3], "-q");
        assert_eq!(cmd[4], "Hello world");
        assert_eq!(cmd.len(), 5);
    }

    #[test]
    fn build_agent_chat_cmd_openclaw_uses_local_flag() {
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "s1", "hi");
        assert!(
            cmd.contains(&"--local".to_string()),
            "must use --local to avoid gateway dependency"
        );
    }

    #[test]
    fn build_agent_chat_cmd_hermes_no_local_flag() {
        let cmd = build_agent_chat_cmd(&AgentType::Hermes, "s1", "hi");
        assert!(
            !cmd.contains(&"--local".to_string()),
            "Hermes should not use --local flag"
        );
    }

    #[test]
    fn build_agent_chat_cmd_session_id_prefixed() {
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "my-session", "hi");
        let session_arg = cmd.iter().skip_while(|a| *a != "--session-id").nth(1).unwrap();
        assert!(
            session_arg.starts_with("clawpier-"),
            "session id must be prefixed: {}",
            session_arg
        );
    }

    #[test]
    fn build_agent_chat_cmd_hermes_no_session_flag() {
        let cmd = build_agent_chat_cmd(&AgentType::Hermes, "my-session", "hi");
        assert!(
            !cmd.contains(&"--resume".to_string()),
            "Hermes should not pass --resume (sessions are managed by Hermes internally)"
        );
    }

    #[test]
    fn build_agent_chat_cmd_preserves_message_with_special_chars() {
        let msg = "Hello! How are you? I'm fine & great <tag> \"quoted\"";
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "s1", msg);
        assert_eq!(cmd.last().unwrap(), msg);
    }

    #[test]
    fn build_agent_chat_cmd_empty_message() {
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "s1", "");
        assert_eq!(cmd.last().unwrap(), "");
    }

    #[test]
    fn build_agent_chat_cmd_multiline_message() {
        let msg = "line1\nline2\nline3";
        let cmd = build_agent_chat_cmd(&AgentType::OpenClaw, "s1", msg);
        assert_eq!(cmd.last().unwrap(), msg, "multiline messages must be preserved");
    }

    #[test]
    fn build_agent_chat_cmd_different_sessions_produce_different_ids() {
        let cmd1 = build_agent_chat_cmd(&AgentType::OpenClaw, "aaa", "hi");
        let cmd2 = build_agent_chat_cmd(&AgentType::OpenClaw, "bbb", "hi");
        let sid1 = cmd1.iter().skip_while(|a| *a != "--session-id").nth(1).unwrap();
        let sid2 = cmd2.iter().skip_while(|a| *a != "--session-id").nth(1).unwrap();
        assert_ne!(sid1, sid2, "different sessions must yield different session ids");
    }

    // ── Skill name validation tests ─────────────────────────────────

    #[test]
    fn validate_skill_name_valid() {
        assert!(validate_skill_name("my-skill").is_ok());
        assert!(validate_skill_name("skill_v2").is_ok());
        assert!(validate_skill_name("@scope/package").is_ok());
        assert!(validate_skill_name("simple").is_ok());
    }

    #[test]
    fn validate_skill_name_empty() {
        assert!(validate_skill_name("").is_err());
    }

    #[test]
    fn validate_skill_name_rejects_special_chars() {
        assert!(validate_skill_name("skill;rm -rf").is_err());
        assert!(validate_skill_name("skill$(cmd)").is_err());
        assert!(validate_skill_name("skill`whoami`").is_err());
        assert!(validate_skill_name("a|b").is_err());
    }

    // ── Port availability tests ────────────────────────────────────

    #[test]
    fn check_port_available_returns_result() {
        let result = check_port_available(0);
        assert_eq!(result.port, 0);
    }

    #[test]
    fn check_port_available_high_port() {
        let result = check_port_available(59999);
        assert_eq!(result.port, 59999);
    }

    #[test]
    fn suggest_port_returns_in_range() {
        let port = suggest_port(50000);
        assert!(port >= 50000 && port <= 50099);
    }

    #[test]
    fn suggest_port_near_max() {
        let port = suggest_port(65500);
        assert!(port >= 65500);
    }

    // ── Skill listing parser tests ────────────────────────────────

    #[test]
    fn parse_openclaw_skills_output_basic() {
        let output = r#"
┌───────────┬───────────┬──────────────┬──────────────────┐
│ Status    │ Skill     │ Description  │ Source           │
├───────────┼───────────┼──────────────┼──────────────────┤
│ ✓ ready   │ ☔ weather │ Get weather  │ openclaw-bundled │
│ ✗ missing │ 📦 slack   │ Slack ops    │ openclaw-bundled │
└───────────┴───────────┴──────────────┴──────────────────┘
"#;
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "weather");
        assert!(skills[0].installed);
        assert_eq!(skills[0].description, "Get weather");
        assert_eq!(skills[1].name, "slack");
        assert!(!skills[1].installed);
    }

    #[test]
    fn parse_openclaw_skills_output_empty() {
        assert!(parse_openclaw_skills_output("Skills (0/0 ready)\n").is_empty());
    }

    #[test]
    fn parse_openclaw_skills_output_sets_source_bundled() {
        let output = "│ ✓ ready   │ ☔ weather │ Get weather  │ openclaw-bundled │\n";
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills[0].source, "bundled");
    }

    #[test]
    fn parse_openclaw_skills_output_installed_status() {
        let output = concat!(
            "│ ✓ ready   │ ☔ weather │ forecast  │ bundled │\n",
            "│ ✗ missing │ 📦 slack   │ messaging │ bundled │\n",
        );
        let skills = parse_openclaw_skills_output(output);
        assert!(skills[0].installed, "✓ should be installed");
        assert!(!skills[1].installed, "✗ should not be installed");
    }

    #[test]
    fn parse_openclaw_skills_output_strips_emoji_from_name() {
        let output = "│ ✓ ready │ 🔐 1password │ 1Pass │ bundled │\n";
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills[0].name, "1password");
    }

    #[test]
    fn parse_openclaw_skills_output_skips_separator_rows() {
        let output = concat!(
            "┌───────────┬───────────┬──────────────┬──────────────────┐\n",
            "│ Status    │ Skill     │ Description  │ Source           │\n",
            "├───────────┼───────────┼──────────────┼──────────────────┤\n",
            "│ ✓ ready   │ ☔ weather │ Get weather  │ openclaw-bundled │\n",
            "└───────────┴───────────┴──────────────┴──────────────────┘\n",
        );
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "weather");
    }

    #[test]
    fn parse_openclaw_skills_output_preserves_description() {
        let output = "│ ✗ missing │ 📦 notion │ Notion API integration for notes │ bundled │\n";
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills[0].description, "Notion API integration for notes");
    }

    #[test]
    fn parse_openclaw_skills_output_author_from_source_column() {
        let output = "│ ✓ ready │ 📦 test │ Desc │ custom-source │\n";
        let skills = parse_openclaw_skills_output(output);
        assert_eq!(skills[0].author, "custom-source");
    }

    // ── ClawHub search output parser tests ─────────────────────────

    #[test]
    fn parse_clawhub_search_basic() {
        let output = "- Searching\nweather  Weather  (3.872)\nweather-pollen  Weather Pollen  (3.536)\n";
        let skills = parse_clawhub_search_output(output);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "weather");
        assert_eq!(skills[0].description, "Weather");
        assert_eq!(skills[1].name, "weather-pollen");
        assert_eq!(skills[1].description, "Weather Pollen");
    }

    #[test]
    fn parse_clawhub_search_sets_source_clawhub() {
        let output = "my-skill  My Skill  (2.5)\n";
        let skills = parse_clawhub_search_output(output);
        assert_eq!(skills[0].source, "clawhub");
    }

    #[test]
    fn parse_clawhub_search_not_installed() {
        let output = "my-skill  My Skill  (2.5)\n";
        let skills = parse_clawhub_search_output(output);
        assert!(!skills[0].installed, "clawhub results should not be marked installed");
    }

    #[test]
    fn parse_clawhub_search_skips_noise() {
        let output = "npm warn something\n- Searching\nmy-skill  My Skill  (2.5)\n";
        let skills = parse_clawhub_search_output(output);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
    }

    #[test]
    fn parse_clawhub_search_empty() {
        assert!(parse_clawhub_search_output("").is_empty());
    }

    #[test]
    fn parse_clawhub_search_only_noise() {
        let output = "npm warn\n- Searching\nerror: no results\n";
        assert!(parse_clawhub_search_output(output).is_empty());
    }

    #[test]
    fn parse_clawhub_search_strips_score() {
        let output = "openmeteo-sh-weather-advanced  Weather via OpenMeteo (via openmeteo-sh cli; advanced ver)  (3.431)\n";
        let skills = parse_clawhub_search_output(output);
        assert_eq!(skills[0].name, "openmeteo-sh-weather-advanced");
        // Description should not include the trailing score
        assert!(!skills[0].description.contains("3.431"));
        assert!(skills[0].description.contains("Weather via OpenMeteo"));
    }

    #[test]
    fn parse_clawhub_search_no_score() {
        let output = "my-skill  A description without a score\n";
        let skills = parse_clawhub_search_output(output);
        assert_eq!(skills[0].description, "A description without a score");
    }

    // ── Skill name validation edge cases ────────────────────────────

    #[test]
    fn validate_skill_name_allows_dots() {
        assert!(validate_skill_name("weather-1.0.0").is_ok());
    }

    #[test]
    fn validate_skill_name_allows_at_scope() {
        assert!(validate_skill_name("@openclaw/weather").is_ok());
    }

    #[test]
    fn validate_skill_name_rejects_path_traversal() {
        assert!(validate_skill_name("../etc/passwd").is_err());
        assert!(validate_skill_name("skill/../../../root").is_err());
    }

    #[test]
    fn validate_skill_name_rejects_newlines() {
        assert!(validate_skill_name("skill\nrm -rf /").is_err());
    }

    #[test]
    fn validate_skill_name_rejects_ampersand() {
        assert!(validate_skill_name("skill&whoami").is_err());
    }

    // ── Image name validation (Hermes support) ───────────────────────

    #[test]
    fn validate_hermes_image_trusted() {
        assert!(validate_image_name("nousresearch/hermes-agent:latest").is_ok());
        assert!(validate_image_name("nousresearch/hermes-agent").is_ok());
    }

    #[test]
    fn validate_openclaw_image_still_trusted() {
        assert!(validate_image_name("ghcr.io/openclaw/openclaw:latest").is_ok());
    }

    #[test]
    fn validate_untrusted_image_rejected() {
        assert!(validate_image_name("malicious/image:latest").is_err());
        assert!(validate_image_name("").is_err());
    }

    #[test]
    fn validate_image_name_rejects_similar_prefix() {
        // Must not match repos that share a prefix with trusted entries
        assert!(validate_image_name("nousresearch/hermes-agent-evil:latest").is_err());
        assert!(validate_image_name("busybox-evil:latest").is_err());
    }

    // ── strip_hermes_metadata tests ─────────────────────────────────

    #[test]
    fn strip_hermes_metadata_box_header_and_session() {
        let raw = "\u{256D}\u{2500} \u{2695} Hermes \u{2500}\u{2500}\u{2500}\u{256E}\ngm! How can I help?\n\nsession_id: 20260410_143433_44d6d2";
        assert_eq!(strip_hermes_metadata(raw), "gm! How can I help?");
    }

    #[test]
    fn strip_hermes_metadata_gt_header_and_session() {
        let raw = "> Hermes\n\nHello! How can I help?\n\nsession_id: 20260410_143433_44d6d2";
        assert_eq!(strip_hermes_metadata(raw), "Hello! How can I help?");
    }

    #[test]
    fn strip_hermes_metadata_arrow_header() {
        let raw = "\u{2190} 1 Hermes\n\ngood morning!\n\nsession_id: 20260410_143433_44d6d2";
        assert_eq!(strip_hermes_metadata(raw), "good morning!");
    }

    #[test]
    fn strip_hermes_metadata_no_metadata() {
        let raw = "Just a plain response";
        assert_eq!(strip_hermes_metadata(raw), "Just a plain response");
    }

    #[test]
    fn strip_hermes_metadata_only_header() {
        let raw = "\u{256D}\u{2500} \u{2695} Hermes \u{2500}\u{256E}\n\nSome content here";
        assert_eq!(strip_hermes_metadata(raw), "Some content here");
    }

    #[test]
    fn strip_hermes_metadata_only_session() {
        let raw = "Some content\n\nsession_id: abc123";
        assert_eq!(strip_hermes_metadata(raw), "Some content");
    }

    #[test]
    fn strip_hermes_metadata_multiline_content() {
        let raw = "\u{256D}\u{2500} \u{2695} Hermes \u{2500}\u{256E}\nLine 1\nLine 2\nLine 3\n\nsession_id: xyz";
        assert_eq!(strip_hermes_metadata(raw), "Line 1\nLine 2\nLine 3");
    }

    #[test]
    fn strip_hermes_metadata_empty_input() {
        assert_eq!(strip_hermes_metadata(""), "");
    }
}
