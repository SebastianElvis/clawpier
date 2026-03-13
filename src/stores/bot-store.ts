import { create } from "zustand";
import type { BotWithStatus } from "../lib/types";
import * as api from "../lib/tauri";

interface BotStore {
  bots: BotWithStatus[];
  loading: boolean;
  dockerAvailable: boolean | null;
  actionInProgress: Set<string>; // bot IDs with pending actions

  // Setters
  setBots: (bots: BotWithStatus[]) => void;
  setDockerAvailable: (available: boolean) => void;
  setActionInProgress: (id: string, inProgress: boolean) => void;

  // Actions
  checkDocker: () => Promise<boolean>;
  fetchBots: () => Promise<void>;
  createBot: (name: string, workspacePath?: string) => Promise<void>;
  startBot: (id: string) => Promise<void>;
  stopBot: (id: string) => Promise<void>;
  deleteBot: (id: string) => Promise<void>;
  renameBot: (id: string, name: string) => Promise<void>;
  toggleNetwork: (id: string, enabled: boolean) => Promise<void>;
}

export const useBotStore = create<BotStore>((set, get) => ({
  bots: [],
  loading: true,
  dockerAvailable: null,
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

  createBot: async (name, workspacePath) => {
    await api.createBot(name, workspacePath);
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
}));
