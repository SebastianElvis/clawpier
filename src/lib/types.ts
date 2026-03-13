export interface BotProfile {
  id: string;
  name: string;
  image: string;
  network_enabled: boolean;
  workspace_path?: string;
  api_key_env?: string;
}

export type BotStatus =
  | { type: "Running" }
  | { type: "Stopped" }
  | { type: "Error"; message: string };

export interface BotWithStatus extends BotProfile {
  status: BotStatus;
}
