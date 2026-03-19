import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useHealthEvents } from "../use-health-events";
import { useToastStore } from "../../stores/toast-store";

const mockListen = vi.mocked(listen);

describe("useHealthEvents", () => {
  let capturedCallback: ((event: unknown) => void) | null = null;
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
    useToastStore.setState({ toasts: [] });

    mockListen.mockImplementation((_event, handler) => {
      capturedCallback = handler as (event: unknown) => void;
      return Promise.resolve(mockUnlisten);
    });
  });

  it("subscribes to bot-health-update event on mount", () => {
    renderHook(() => useHealthEvents());
    expect(mockListen).toHaveBeenCalledWith(
      "bot-health-update",
      expect.any(Function)
    );
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useHealthEvents());
    unmount();
    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  it("shows error toast when bot becomes unhealthy (>= 3 failures)", () => {
    renderHook(() => useHealthEvents());

    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 3,
        last_output: "error: timeout",
      },
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].title).toBe("Health check failing");
    expect(toasts[0].description).toContain("3 consecutive");
  });

  it("does not toast for fewer than 3 failures", () => {
    renderHook(() => useHealthEvents());

    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 2,
        last_output: null,
      },
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("does not repeat toast for same bot", () => {
    renderHook(() => useHealthEvents());

    // First failure — toast
    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 3,
        last_output: null,
      },
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Second failure — no duplicate toast
    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 4,
        last_output: null,
      },
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("re-toasts after recovery and new failure", () => {
    renderHook(() => useHealthEvents());

    // Fail
    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 3,
        last_output: null,
      },
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Recover
    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: true,
        consecutive_failures: 0,
        last_output: "ok",
      },
    });

    // Fail again — should toast again
    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 3,
        last_output: null,
      },
    });
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it("tracks different bots independently", () => {
    renderHook(() => useHealthEvents());

    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: false,
        consecutive_failures: 3,
        last_output: null,
      },
    });
    capturedCallback!({
      payload: {
        bot_id: "bot-2",
        healthy: false,
        consecutive_failures: 3,
        last_output: null,
      },
    });

    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it("does not toast for healthy events", () => {
    renderHook(() => useHealthEvents());

    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        healthy: true,
        consecutive_failures: 0,
        last_output: "ok",
      },
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
