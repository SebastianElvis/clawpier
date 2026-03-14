import { invoke } from "@tauri-apps/api/core";
import type {
  BotProfile,
  BotWithStatus,
  EnvVar,
  ExecResult,
  FileEntry,
} from "./types";

export async function checkDocker(): Promise<boolean> {
  return invoke<boolean>("check_docker");
}

export async function listBots(): Promise<BotWithStatus[]> {
  return invoke<BotWithStatus[]>("list_bots");
}

export async function createBot(
  name: string,
  workspacePath?: string
): Promise<BotProfile> {
  return invoke<BotProfile>("create_bot", {
    name,
    workspacePath: workspacePath ?? null,
  });
}

export async function startBot(id: string): Promise<void> {
  return invoke("start_bot", { id });
}

export async function stopBot(id: string): Promise<void> {
  return invoke("stop_bot", { id });
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

export async function checkImage(image: string): Promise<boolean> {
  return invoke<boolean>("check_image", { image });
}

export async function pullImage(image: string): Promise<void> {
  return invoke("pull_image", { image });
}

// ── New commands ─────────────────────────────────────────────────────

export async function updateEnvVars(
  id: string,
  envVars: EnvVar[]
): Promise<void> {
  return invoke("update_env_vars", { id, envVars });
}

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
  command: string
): Promise<ExecResult> {
  return invoke<ExecResult>("exec_command", { id, command });
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
