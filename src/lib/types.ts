export interface EnvVar {
  key: string;
  value: string;
}

export type NetworkMode = "none" | "bridge" | "host" | { custom: string };

export interface PortMapping {
  container_port: number;
  host_port: number;
  protocol: "tcp" | "udp";
}

export interface BotProfile {
  id: string;
  name: string;
  image: string;
  network_mode: NetworkMode;
  workspace_path?: string;
  api_key_env?: string;
  env_vars: EnvVar[];
  cpu_limit?: number | null;
  memory_limit?: number | null;
  port_mappings: PortMapping[];
  auto_start: boolean;
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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSessionSummary {
  id: string;
  name: string;
  created_at: string;
  message_count: number;
}

export interface ChatSession {
  id: string;
  bot_id: string;
  name: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface ChatResponseChunk {
  session_id: string;
  content: string;
  done: boolean;
}

export interface SystemResources {
  cpu_cores: number;
  memory_bytes: number;
}

export interface StatusChangedEvent {
  bot_id: string;
  bot_name: string;
  from: string;
  to: string;
}
