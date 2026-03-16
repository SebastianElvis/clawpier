import { invoke } from "@tauri-apps/api/core";
import type {
  BotProfile,
  BotWithStatus,
  ChatMessage,
  ChatSessionSummary,
  EnvVar,
  ExecResult,
  FileEntry,
  NetworkMode,
  PortMapping,
  SystemResources,
} from "./types";

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export async function getSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>("get_system_resources");
}

export async function checkDocker(): Promise<boolean> {
  return invoke<boolean>("check_docker");
}

export async function checkDockerHealth(): Promise<boolean> {
  return invoke<boolean>("check_docker_health");
}

export async function listBots(): Promise<BotWithStatus[]> {
  return invoke<BotWithStatus[]>("list_bots");
}

export async function createBot(
  name: string,
  workspacePath?: string,
  opts?: {
    cpuLimit?: number | null;
    memoryLimit?: number | null;
    networkMode?: NetworkMode;
  }
): Promise<BotProfile> {
  return invoke<BotProfile>("create_bot", {
    name,
    workspacePath: workspacePath ?? null,
    cpuLimit: opts?.cpuLimit ?? null,
    memoryLimit: opts?.memoryLimit ?? null,
    networkMode: opts?.networkMode ?? null,
  });
}

export async function startBot(id: string): Promise<void> {
  return invoke("start_bot", { id });
}

export async function stopBot(id: string): Promise<void> {
  return invoke("stop_bot", { id });
}

export async function restartBot(id: string): Promise<void> {
  return invoke("restart_bot", { id });
}

export async function deleteBot(id: string): Promise<void> {
  return invoke("delete_bot", { id });
}

export async function renameBot(id: string, name: string): Promise<void> {
  return invoke("rename_bot", { id, name });
}

export async function toggleNetwork(
  id: string,
  enabled: boolean
): Promise<void> {
  return invoke("toggle_network", { id, enabled });
}

export async function setWorkspacePath(
  id: string,
  workspacePath: string | null
): Promise<void> {
  return invoke("set_workspace_path", {
    id,
    workspacePath,
  });
}

export async function checkImage(image: string): Promise<boolean> {
  return invoke<boolean>("check_image", { image });
}

export async function pullImage(image: string): Promise<void> {
  return invoke("pull_image", { image });
}

// ── Resource & config commands ──────────────────────────────────────

export async function updateEnvVars(
  id: string,
  envVars: EnvVar[]
): Promise<void> {
  return invoke("update_env_vars", { id, envVars });
}

export async function updateResourceLimits(
  id: string,
  cpuLimit: number | null,
  memoryLimit: number | null
): Promise<void> {
  return invoke("update_resource_limits", { id, cpuLimit, memoryLimit });
}

export async function setNetworkMode(
  id: string,
  mode: NetworkMode
): Promise<void> {
  return invoke("set_network_mode", { id, mode });
}

export async function updatePortMappings(
  id: string,
  portMappings: PortMapping[]
): Promise<void> {
  return invoke("update_port_mappings", { id, portMappings });
}

// ── Config backup/restore ───────────────────────────────────────────

export async function exportConfig(): Promise<string> {
  return invoke<string>("export_config");
}

export async function importConfig(json: string): Promise<BotWithStatus[]> {
  return invoke<BotWithStatus[]>("import_config", { json });
}

// ── Stats & log streaming ───────────────────────────────────────────

export async function startStatsStream(id: string): Promise<void> {
  return invoke("start_stats_stream", { id });
}

export async function stopStatsStream(id: string): Promise<void> {
  return invoke("stop_stats_stream", { id });
}

export async function startLogStream(
  id: string,
  tail?: number
): Promise<void> {
  return invoke("start_log_stream", { id, tail: tail ?? null });
}

export async function stopLogStream(id: string): Promise<void> {
  return invoke("stop_log_stream", { id });
}

export async function execCommand(
  id: string,
  args: string[]
): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { id, args });
}

export async function listWorkspaceFiles(
  id: string,
  path?: string
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_workspace_files", {
    id,
    path: path ?? null,
  });
}

export async function readWorkspaceFile(
  id: string,
  path: string
): Promise<string> {
  return invoke<string>("read_workspace_file", { id, path });
}

// ── Bot config commands ───────────────────────────────────────────

export async function getBotConfig(
  id: string
): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_bot_config", { id });
}

export interface TelegramBotInfo {
  id: number;
  first_name: string;
  username: string | null;
  is_bot: boolean;
}

export async function resolveTelegramBot(
  id: string
): Promise<TelegramBotInfo> {
  return invoke<TelegramBotInfo>("resolve_telegram_bot", { id });
}

// ── Chat commands ─────────────────────────────────────────────────

export async function listChatSessions(
  id: string
): Promise<ChatSessionSummary[]> {
  return invoke<ChatSessionSummary[]>("list_chat_sessions", { id });
}

export async function createChatSession(
  id: string,
  name: string
): Promise<ChatSessionSummary> {
  return invoke<ChatSessionSummary>("create_chat_session", { id, name });
}

export async function renameChatSession(
  id: string,
  sessionId: string,
  name: string
): Promise<void> {
  return invoke("rename_chat_session", { id, sessionId, name });
}

export async function deleteChatSession(
  id: string,
  sessionId: string
): Promise<void> {
  return invoke("delete_chat_session", { id, sessionId });
}

export async function getChatMessages(
  id: string,
  sessionId: string
): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>("get_chat_messages", { id, sessionId });
}

export async function sendChatMessage(
  id: string,
  sessionId: string,
  message: string
): Promise<void> {
  return invoke("send_chat_message", { id, sessionId, message });
}

export async function stopChatResponse(id: string): Promise<void> {
  return invoke("stop_chat_response", { id });
}

// ── Log export ────────────────────────────────────────────────────

export async function exportLogs(
  path: string,
  content: string
): Promise<void> {
  return invoke("export_logs", { path, content });
}

// ── Interactive terminal commands ──────────────────────────────────

export async function startTerminalSession(
  id: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("start_terminal_session", { id, cols, rows });
}

export async function writeTerminalInput(
  id: string,
  data: string
): Promise<void> {
  return invoke("write_terminal_input", { id, data });
}

export async function resizeTerminal(
  id: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_terminal", { id, cols, rows });
}

// ── Crash logging ──────────────────────────────────────────────────

export async function logCrash(
  message: string,
  stack: string,
  componentStack: string
): Promise<void> {
  return invoke<void>("log_crash", { message, stack, componentStack });
}
