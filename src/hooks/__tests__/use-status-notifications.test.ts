import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useStatusNotifications } from "../use-status-notifications";
import { useToastStore } from "../../stores/toast-store";

// listen is already mocked in test/setup.ts — we override per test
const mockListen = vi.mocked(listen);

describe("useStatusNotifications", () => {
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

  it("subscribes to bot-status-changed event on mount", () => {
    renderHook(() => useStatusNotifications());
    expect(mockListen).toHaveBeenCalledWith(
      "bot-status-changed",
      expect.any(Function)
    );
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useStatusNotifications());
    unmount();
    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  it("shows error toast when bot crashes (Running → Error)", () => {
    renderHook(() => useStatusNotifications());

    capturedCallback!({
      payload: {
        bot_id: "bot-1",
        bot_name: "Piggy Claw",
        from: "Running",
        to: "Error",
      },
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].title).toBe("Piggy Claw crashed");
  });

  it("shows warning toast when bot stops unexpectedly (Running → Stopped)", () => {
    renderHook(() => useStatusNotifications());

    capturedCallback!({
      payload: {
        bot_id: "bot-2",
        bot_name: "Test Bot",
        from: "Running",
        to: "Stopped",
      },
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("warning");
    expect(toasts[0].title).toBe("Test Bot stopped unexpectedly");
  });
});
