import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useResourceAlerts } from "../use-resource-alerts";
import { useBotStore } from "../../stores/bot-store";
import { useNotificationStore } from "../../stores/notification-store";
import type { BotWithStatus, ContainerStats } from "../../lib/types";

const mockListen = vi.mocked(listen);

function makeBot(id: string, name: string): BotWithStatus {
  return {
    id,
    name,
    image: "test:latest",
    agent_type: "OpenClaw",
    network_mode: "none",
    env_vars: [],
    port_mappings: [],
    auto_start: false,
    status: { type: "Running" },
  };
}

function makeStats(overrides: Partial<ContainerStats> = {}): ContainerStats {
  return {
    cpu_percent: 10,
    cpu_cores: 1, // 1 core so CPU threshold stays at cpuThresholdPercent (90%)
    memory_usage: 100_000_000,
    memory_limit: 1_000_000_000,
    memory_percent: 10,
    network_rx: 0,
    network_tx: 0,
    ...overrides,
  };
}

describe("useResourceAlerts", () => {
  const capturedCallbacks = new Map<string, (event: unknown) => void>();
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks.clear();

    // Reset stores
    useBotStore.setState({ bots: [] });
    useNotificationStore.setState({
      notifications: [],
      preferences: {
        healthAlerts: true,
        statusAlerts: true,
        resourceAlerts: true,
        cpuThresholdPercent: 90,
        memoryThresholdPercent: 85,
      },
    });

    mockListen.mockImplementation((eventName, handler) => {
      capturedCallbacks.set(
        eventName as string,
        handler as (event: unknown) => void
      );
      return Promise.resolve(mockUnlisten);
    });
  });

  it("subscribes to container-stats events for running bots", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    expect(mockListen).toHaveBeenCalledWith(
      "container-stats-bot-1",
      expect.any(Function)
    );
  });

  it("does not subscribe for stopped bots", () => {
    const stoppedBot = makeBot("bot-2", "Beta");
    stoppedBot.status = { type: "Stopped" };
    useBotStore.setState({ bots: [stoppedBot] });

    renderHook(() => useResourceAlerts());
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("no alert when below threshold", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;
    cb({ payload: makeStats({ cpu_percent: 50, memory_percent: 40 }) });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("fires alert when CPU exceeds threshold", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;
    cb({ payload: makeStats({ cpu_percent: 95 }) });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("High CPU usage");
    expect(notifications[0].description).toContain("95.0% CPU");
    expect(notifications[0].description).toContain("threshold: 90%");
    expect(notifications[0].botId).toBe("bot-1");
    expect(notifications[0].botName).toBe("Alpha");
  });

  it("fires alert when memory exceeds threshold", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;
    cb({ payload: makeStats({ memory_percent: 92 }) });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("High memory usage");
    expect(notifications[0].description).toContain("92.0% memory");
    expect(notifications[0].description).toContain("threshold: 85%");
  });

  it("cooldown prevents repeated alerts within 5 minutes", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;

    // First breach — should alert
    cb({ payload: makeStats({ cpu_percent: 95 }) });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    // Second breach immediately — should NOT alert (cooldown)
    cb({ payload: makeStats({ cpu_percent: 96 }) });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("cooldown resets when metric drops below threshold", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;

    // First breach
    cb({ payload: makeStats({ cpu_percent: 95 }) });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    // Drop below threshold — resets cooldown
    cb({ payload: makeStats({ cpu_percent: 50 }) });

    // Breach again — should alert because cooldown was reset
    cb({ payload: makeStats({ cpu_percent: 91 }) });
    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });

  it("respects resourceAlerts: false preference", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    useNotificationStore.setState({
      preferences: {
        healthAlerts: true,
        statusAlerts: true,
        resourceAlerts: false,
        cpuThresholdPercent: 90,
        memoryThresholdPercent: 85,
      },
    });

    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;
    cb({ payload: makeStats({ cpu_percent: 99, memory_percent: 99 }) });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("fires both CPU and memory alerts simultaneously", () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    renderHook(() => useResourceAlerts());

    const cb = capturedCallbacks.get("container-stats-bot-1")!;
    cb({ payload: makeStats({ cpu_percent: 95, memory_percent: 90 }) });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(2);
    const titles = notifications.map((n) => n.title);
    expect(titles).toContain("High CPU usage");
    expect(titles).toContain("High memory usage");
  });

  it("unsubscribes on unmount", async () => {
    useBotStore.setState({ bots: [makeBot("bot-1", "Alpha")] });
    const { unmount } = renderHook(() => useResourceAlerts());
    unmount();

    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });
});
