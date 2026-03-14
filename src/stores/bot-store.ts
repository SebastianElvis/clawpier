import { create } from "zustand";
import type { BotWithStatus, EnvVar, NetworkMode, PortMapping } from "../lib/types";
import * as api from "../lib/tauri";

export const DEFAULT_IMAGE = "ghcr.io/openclaw/openclaw:latest";

interface BotStore {
  bots: BotWithStatus[];
  loading: boolean;
  dockerAvailable: boolean | null;
  imageAvailable: boolean | null; // null = not checked yet
  actionInProgress: Set<string>; // bot IDs with pending actions

  // Setters
  setBots: (bots: BotWithStatus[]) => void;
  setDockerAvailable: (available: boolean) => void;
  setActionInProgress: (id: string, inProgress: boolean) => void;

  // Actions
  checkDocker: () => Promise<boolean>;
  checkImage: () => Promise<boolean>;
  pullImage: () => Promise<void>;
  fetchBots: () => Promise<void>;
  createBot: (name: string, workspacePath?: string, opts?: { cpuLimit?: number | null; memoryLimit?: number | null; networkMode?: NetworkMode }) => Promise<void>;
  startBot: (id: string) => Promise<void>;
  stopBot: (id: string) => Promise<void>;
  restartBot: (id: string) => Promise<void>;
  deleteBot: (id: string) => Promise<void>;
  renameBot: (id: string, name: string) => Promise<void>;
  toggleNetwork: (id: string, enabled: boolean) => Promise<void>;
  setNetworkMode: (id: string, mode: NetworkMode) => Promise<void>;
  updateEnvVars: (id: string, envVars: EnvVar[]) => Promise<void>;
  setWorkspacePath: (id: string, workspacePath: string | null) => Promise<void>;
  updateResourceLimits: (id: string, cpuLimit: number | null, memoryLimit: number | null) => Promise<void>;
  updatePortMappings: (id: string, portMappings: PortMapping[]) => Promise<void>;
}

export const useBotStore = create<BotStore>((set, get) => ({
  bots: [],
  loading: true,
  dockerAvailable: null,
  imageAvailable: null,
  actionInProgress: new Set(),

  setBots: (bots) => set({ bots }),

  setDockerAvailable: (available) => set({ dockerAvailable: available }),

  setActionInProgress: (id, inProgress) => {
    const current = new Set(get().actionInProgress);
    if (inProgress) {
      current.add(id);
    } else {
      current.delete(id);
    }
    set({ actionInProgress: current });
  },

  checkDocker: async () => {
    try {
      const available = await api.checkDocker();
      set({ dockerAvailable: available });
      return available;
    } catch {
      set({ dockerAvailable: false });
      return false;
    }
  },

  checkImage: async () => {
    try {
      const available = await api.checkImage(DEFAULT_IMAGE);
      set({ imageAvailable: available });
      return available;
    } catch {
      set({ imageAvailable: false });
      return false;
    }
  },

  pullImage: async () => {
    await api.pullImage(DEFAULT_IMAGE);
    set({ imageAvailable: true });
  },

  fetchBots: async () => {
    try {
      set({ loading: true });
      const bots = await api.listBots();
      set({ bots, loading: false });
    } catch (error) {
      console.error("Failed to fetch bots:", error);
      set({ loading: false });
    }
  },

  createBot: async (name, workspacePath, opts) => {
    await api.createBot(name, workspacePath, opts);
    await get().fetchBots();
  },

  startBot: async (id) => {
    get().setActionInProgress(id, true);
    try {
      await api.startBot(id);
      await get().fetchBots();
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  stopBot: async (id) => {
    get().setActionInProgress(id, true);
    try {
      await api.stopBot(id);
      await get().fetchBots();
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  restartBot: async (id) => {
    get().setActionInProgress(id, true);
    try {
      await api.restartBot(id);
      await get().fetchBots();
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  deleteBot: async (id) => {
    await api.deleteBot(id);
    await get().fetchBots();
  },

  renameBot: async (id, name) => {
    await api.renameBot(id, name);
    await get().fetchBots();
  },

  toggleNetwork: async (id, enabled) => {
    await api.toggleNetwork(id, enabled);
    await get().fetchBots();
  },

  setNetworkMode: async (id, mode) => {
    await api.setNetworkMode(id, mode);
    await get().fetchBots();
  },

  updateEnvVars: async (id, envVars) => {
    await api.updateEnvVars(id, envVars);
    await get().fetchBots();
  },

  setWorkspacePath: async (id, workspacePath) => {
    await api.setWorkspacePath(id, workspacePath);
    await get().fetchBots();
  },

  updateResourceLimits: async (id, cpuLimit, memoryLimit) => {
    await api.updateResourceLimits(id, cpuLimit, memoryLimit);
    await get().fetchBots();
  },

  updatePortMappings: async (id, portMappings) => {
    await api.updatePortMappings(id, portMappings);
    await get().fetchBots();
  },
}));
