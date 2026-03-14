import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useBotStore } from "../bot-store";
import type { BotWithStatus } from "../../lib/types";

const mockedInvoke = vi.mocked(invoke);

const makeBotWithStatus = (
  id: string,
  name: string,
  status: "Running" | "Stopped" = "Stopped"
): BotWithStatus => ({
  id,
  name,
  image: "ghcr.io/openclaw/openclaw:latest",
  network_enabled: false,
  env_vars: [],
  status: { type: status },
});

beforeEach(() => {
  // Reset store state between tests
  useBotStore.setState({
    bots: [],
    loading: true,
    dockerAvailable: null,
    imageAvailable: null,
    actionInProgress: new Set(),
  });
  vi.clearAllMocks();
});

describe("bot-store", () => {
  describe("checkDocker", () => {
    it("sets dockerAvailable to true when Docker is reachable", async () => {
      mockedInvoke.mockResolvedValueOnce(true);

      const result = await useBotStore.getState().checkDocker();

      expect(result).toBe(true);
      expect(useBotStore.getState().dockerAvailable).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith("check_docker");
    });

    it("sets dockerAvailable to false on error", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("no docker"));

      const result = await useBotStore.getState().checkDocker();

      expect(result).toBe(false);
      expect(useBotStore.getState().dockerAvailable).toBe(false);
    });
  });

  describe("fetchBots", () => {
    it("stores bots and sets loading false", async () => {
      const bots = [makeBotWithStatus("1", "Bot1", "Running")];
      mockedInvoke.mockResolvedValueOnce(bots);

      await useBotStore.getState().fetchBots();

      expect(useBotStore.getState().bots).toEqual(bots);
      expect(useBotStore.getState().loading).toBe(false);
    });

    it("handles fetch error gracefully", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      await useBotStore.getState().fetchBots();

      expect(useBotStore.getState().bots).toEqual([]);
      expect(useBotStore.getState().loading).toBe(false);
    });
  });

  describe("actionInProgress", () => {
    it("tracks in-progress actions by bot ID", () => {
      const { setActionInProgress } = useBotStore.getState();

      setActionInProgress("bot-1", true);
      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(true);

      setActionInProgress("bot-1", false);
      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(false);
    });

    it("tracks multiple bots independently", () => {
      const { setActionInProgress } = useBotStore.getState();

      setActionInProgress("a", true);
      setActionInProgress("b", true);
      expect(useBotStore.getState().actionInProgress.size).toBe(2);

      setActionInProgress("a", false);
      expect(useBotStore.getState().actionInProgress.has("a")).toBe(false);
      expect(useBotStore.getState().actionInProgress.has("b")).toBe(true);
    });
  });

  describe("restartBot", () => {
    it("sets and clears actionInProgress around restart", async () => {
      // restart_bot invoke
      mockedInvoke.mockResolvedValueOnce(undefined);
      // list_bots invoke (from fetchBots)
      mockedInvoke.mockResolvedValueOnce([]);

      await useBotStore.getState().restartBot("bot-1");

      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(false);
      expect(mockedInvoke).toHaveBeenCalledWith("restart_bot", { id: "bot-1" });
    });

    it("clears actionInProgress on error", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("restart failed"));

      await expect(
        useBotStore.getState().restartBot("bot-1")
      ).rejects.toThrow();

      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(false);
    });
  });

  describe("startBot / stopBot", () => {
    it("startBot calls invoke and refreshes bots", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // start_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().startBot("bot-1");

      expect(mockedInvoke).toHaveBeenCalledWith("start_bot", { id: "bot-1" });
      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(false);
    });

    it("stopBot calls invoke and refreshes bots", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // stop_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().stopBot("bot-1");

      expect(mockedInvoke).toHaveBeenCalledWith("stop_bot", { id: "bot-1" });
      expect(useBotStore.getState().actionInProgress.has("bot-1")).toBe(false);
    });
  });
});
