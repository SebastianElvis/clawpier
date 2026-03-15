import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useToastStore } from "../toast-store";

describe("toast-store", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a toast", () => {
    useToastStore.getState().addToast({ type: "success", title: "Test" });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].title).toBe("Test");
  });

  it("auto-dismisses after duration", () => {
    useToastStore.getState().addToast({ type: "info", title: "Test", duration: 1000 });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("caps at 5 toasts", () => {
    for (let i = 0; i < 7; i++) {
      useToastStore.getState().addToast({ type: "info", title: `Toast ${i}` });
    }
    expect(useToastStore.getState().toasts).toHaveLength(5);
  });

  it("dismisses by id", () => {
    const id = useToastStore.getState().addToast({ type: "info", title: "Test" });
    useToastStore.getState().dismissToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("uses longer duration for errors", () => {
    useToastStore.getState().addToast({ type: "error", title: "Error" });
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
