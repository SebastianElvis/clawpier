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
  network_mode: "none" as const,
  env_vars: [],
  port_mappings: [],
  auto_start: false,
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

  // ── Phase 1-3 tests ──────────────────────────────────────────────

  describe("createBot", () => {
    it("creates bot with default options", async () => {
      mockedInvoke.mockResolvedValueOnce({ id: "new-1", name: "Basic" }); // create_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().createBot("Basic");

      expect(mockedInvoke).toHaveBeenCalledWith("create_bot", {
        name: "Basic",
        workspacePath: null,
        cpuLimit: null,
        memoryLimit: null,
        networkMode: null,
      });
    });

    it("creates bot with workspace path", async () => {
      mockedInvoke.mockResolvedValueOnce({ id: "new-2", name: "WithWS" }); // create_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().createBot("WithWS", "/my/workspace");

      expect(mockedInvoke).toHaveBeenCalledWith("create_bot", {
        name: "WithWS",
        workspacePath: "/my/workspace",
        cpuLimit: null,
        memoryLimit: null,
        networkMode: null,
      });
    });

    it("creates bot with resource limits and network mode", async () => {
      mockedInvoke.mockResolvedValueOnce({ id: "new-3", name: "Full" }); // create_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().createBot("Full", undefined, {
        cpuLimit: 2,
        memoryLimit: 4_294_967_296,
        networkMode: "bridge",
      });

      expect(mockedInvoke).toHaveBeenCalledWith("create_bot", {
        name: "Full",
        workspacePath: null,
        cpuLimit: 2,
        memoryLimit: 4_294_967_296,
        networkMode: "bridge",
      });
    });

    it("refreshes bots after creation", async () => {
      const newBots = [makeBotWithStatus("new-1", "Created")];
      mockedInvoke.mockResolvedValueOnce({ id: "new-1", name: "Created" }); // create_bot
      mockedInvoke.mockResolvedValueOnce(newBots); // list_bots

      await useBotStore.getState().createBot("Created");

      expect(useBotStore.getState().bots).toEqual(newBots);
    });
  });

  describe("updateResourceLimits", () => {
    it("invokes update_resource_limits and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // update_resource_limits
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().updateResourceLimits("bot-1", 4.0, 8_000_000_000);

      expect(mockedInvoke).toHaveBeenCalledWith("update_resource_limits", {
        id: "bot-1",
        cpuLimit: 4.0,
        memoryLimit: 8_000_000_000,
      });
    });

    it("passes null for no limits", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // update_resource_limits
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().updateResourceLimits("bot-1", null, null);

      expect(mockedInvoke).toHaveBeenCalledWith("update_resource_limits", {
        id: "bot-1",
        cpuLimit: null,
        memoryLimit: null,
      });
    });
  });

  describe("updatePortMappings", () => {
    it("invokes update_port_mappings and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // update_port_mappings
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      const mappings = [
        { container_port: 8080, host_port: 9090, protocol: "tcp" as const },
      ];
      await useBotStore.getState().updatePortMappings("bot-1", mappings);

      expect(mockedInvoke).toHaveBeenCalledWith("update_port_mappings", {
        id: "bot-1",
        portMappings: mappings,
      });
    });
  });

  describe("setNetworkMode", () => {
    it("invokes set_network_mode with string mode", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // set_network_mode
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().setNetworkMode("bot-1", "host");

      expect(mockedInvoke).toHaveBeenCalledWith("set_network_mode", {
        id: "bot-1",
        mode: "host",
      });
    });

    it("invokes set_network_mode with custom mode", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // set_network_mode
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore
        .getState()
        .setNetworkMode("bot-1", { custom: "my-net" });

      expect(mockedInvoke).toHaveBeenCalledWith("set_network_mode", {
        id: "bot-1",
        mode: { custom: "my-net" },
      });
    });
  });

  describe("toggleNetwork", () => {
    it("invokes toggle_network and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // toggle_network
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().toggleNetwork("bot-1", true);

      expect(mockedInvoke).toHaveBeenCalledWith("toggle_network", {
        id: "bot-1",
        enabled: true,
      });
    });

    it("toggles off", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // toggle_network
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().toggleNetwork("bot-1", false);

      expect(mockedInvoke).toHaveBeenCalledWith("toggle_network", {
        id: "bot-1",
        enabled: false,
      });
    });
  });

  describe("updateEnvVars", () => {
    it("invokes update_env_vars and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // update_env_vars
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      const vars = [{ key: "TOKEN", value: "secret" }];
      await useBotStore.getState().updateEnvVars("bot-1", vars);

      expect(mockedInvoke).toHaveBeenCalledWith("update_env_vars", {
        id: "bot-1",
        envVars: vars,
      });
    });
  });

  describe("setAutoStart", () => {
    it("invokes set_auto_start and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // set_auto_start
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().setAutoStart("bot-1", true);

      expect(mockedInvoke).toHaveBeenCalledWith("set_auto_start", {
        id: "bot-1",
        autoStart: true,
      });
    });

    it("can disable auto-start", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // set_auto_start
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().setAutoStart("bot-1", false);

      expect(mockedInvoke).toHaveBeenCalledWith("set_auto_start", {
        id: "bot-1",
        autoStart: false,
      });
    });
  });

  describe("deleteBot", () => {
    it("invokes delete_bot and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // delete_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().deleteBot("bot-1");

      expect(mockedInvoke).toHaveBeenCalledWith("delete_bot", { id: "bot-1" });
    });
  });

  describe("renameBot", () => {
    it("invokes rename_bot and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // rename_bot
      mockedInvoke.mockResolvedValueOnce([]); // list_bots

      await useBotStore.getState().renameBot("bot-1", "NewName");

      expect(mockedInvoke).toHaveBeenCalledWith("rename_bot", {
        id: "bot-1",
        name: "NewName",
      });
    });
  });
});
