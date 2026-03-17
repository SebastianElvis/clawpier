import { create } from "zustand";
import type { BotWithStatus, EnvVar, NetworkMode, PortMapping } from "../lib/types";
import * as api from "../lib/tauri";
import { useToastStore } from "./toast-store";

export const DEFAULT_IMAGE = "ghcr.io/openclaw/openclaw:latest";

interface BotStore {
  bots: BotWithStatus[];
  loading: boolean;
  dockerAvailable: boolean | null;
  imageAvailable: boolean | null; // null = not checked yet
  actionInProgress: Set<string>; // bot IDs with pending actions
  dockerConnected: boolean;

  // Setters
  setBots: (bots: BotWithStatus[]) => void;
  setDockerAvailable: (available: boolean) => void;
  setActionInProgress: (id: string, inProgress: boolean) => void;
  setDockerConnected: (connected: boolean) => void;

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
  setAutoStart: (id: string, autoStart: boolean) => Promise<void>;
}

export const useBotStore = create<BotStore>((set, get) => ({
  bots: [],
  loading: true,
  dockerAvailable: null,
  imageAvailable: null,
  actionInProgress: new Set(),
  dockerConnected: true,

  setBots: (bots) => set({ bots }),

  setDockerAvailable: (available) => set({ dockerAvailable: available }),

  setDockerConnected: (connected) => set({ dockerConnected: connected }),

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
    const toast = useToastStore.getState().addToast;
    try {
      toast({ type: "info", title: "Pulling image", description: "Downloading OpenClaw image..." });
      await api.pullImage(DEFAULT_IMAGE);
      set({ imageAvailable: true });
    } catch (e) {
      toast({ type: "error", title: "Failed to pull image", description: String(e) });
      throw e;
    }
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
    const toast = useToastStore.getState().addToast;
    try {
      await api.createBot(name, workspacePath, opts);
      await get().fetchBots();
      toast({ type: "success", title: "Bot created", description: `"${name}" is ready` });
    } catch (e) {
      toast({ type: "error", title: "Failed to create bot", description: String(e) });
      throw e;
    }
  },

  startBot: async (id) => {
    const toast = useToastStore.getState().addToast;
    if (!get().dockerConnected) {
      toast({ type: "warning", title: "Docker is unavailable" });
      return;
    }
    get().setActionInProgress(id, true);
    try {
      await api.startBot(id);
      await get().fetchBots();
      const bot = get().bots.find((b) => b.id === id);
      toast({ type: "success", title: "Bot started", description: bot ? `"${bot.name}" is running` : undefined });
    } catch (e) {
      toast({ type: "error", title: "Failed to start bot", description: String(e) });
      throw e;
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  stopBot: async (id) => {
    const toast = useToastStore.getState().addToast;
    if (!get().dockerConnected) {
      toast({ type: "warning", title: "Docker is unavailable" });
      return;
    }
    get().setActionInProgress(id, true);
    try {
      const bot = get().bots.find((b) => b.id === id);
      await api.stopBot(id);
      await get().fetchBots();
      toast({ type: "success", title: "Bot stopped", description: bot ? `"${bot.name}" has been stopped` : undefined });
    } catch (e) {
      toast({ type: "error", title: "Failed to stop bot", description: String(e) });
      throw e;
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  restartBot: async (id) => {
    const toast = useToastStore.getState().addToast;
    if (!get().dockerConnected) {
      toast({ type: "warning", title: "Docker is unavailable" });
      return;
    }
    get().setActionInProgress(id, true);
    try {
      await api.restartBot(id);
      await get().fetchBots();
      const bot = get().bots.find((b) => b.id === id);
      toast({ type: "success", title: "Bot restarted", description: bot ? `"${bot.name}" is running` : undefined });
    } catch (e) {
      toast({ type: "error", title: "Failed to restart bot", description: String(e) });
      throw e;
    } finally {
      get().setActionInProgress(id, false);
    }
  },

  deleteBot: async (id) => {
    const toast = useToastStore.getState().addToast;
    const bot = get().bots.find((b) => b.id === id);
    try {
      await api.deleteBot(id);
      await get().fetchBots();
      toast({ type: "success", title: "Bot deleted", description: bot ? `"${bot.name}" has been removed` : undefined });
    } catch (e) {
      toast({ type: "error", title: "Failed to delete bot", description: String(e) });
      throw e;
    }
  },

  renameBot: async (id, name) => {
    await api.renameBot(id, name);
    await get().fetchBots();
  },

  toggleNetwork: async (id, enabled) => {
    const toast = useToastStore.getState().addToast;
    try {
      await api.toggleNetwork(id, enabled);
      await get().fetchBots();
      toast({ type: "info", title: "Network updated", description: enabled ? "Network access enabled" : "Network access disabled" });
    } catch (e) {
      toast({ type: "error", title: "Failed to toggle network", description: String(e) });
      throw e;
    }
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

  setAutoStart: async (id, autoStart) => {
    await api.setAutoStart(id, autoStart);
    await get().fetchBots();
  },
}));
