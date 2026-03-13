import { invoke } from "@tauri-apps/api/core";
import type { BotProfile, BotWithStatus } from "./types";

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

export async function pullImage(image: string): Promise<void> {
  return invoke("pull_image", { image });
}
