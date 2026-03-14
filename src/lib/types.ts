export interface EnvVar {
  key: string;
  value: string;
}

export interface BotProfile {
  id: string;
  name: string;
  image: string;
  network_enabled: boolean;
  workspace_path?: string;
  api_key_env?: string;
  env_vars: EnvVar[];
}

export type BotStatus =
  | { type: "Running" }
  | { type: "Stopped" }
  | { type: "Error"; message: string };

export interface BotWithStatus extends BotProfile {
  status: BotStatus;
}

export interface ContainerStats {
  cpu_percent: number;
  cpu_cores: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
}

export interface LogEntry {
  timestamp: string | null;
  message: string;
  stream: "stdout" | "stderr";
}

export interface ExecResult {
  output: string;
  exit_code: number | null;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}
