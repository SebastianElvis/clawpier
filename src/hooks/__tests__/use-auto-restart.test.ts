import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAutoRestart } from "../use-auto-restart";

describe("useAutoRestart", () => {
  const mockRestartBot = vi.fn().mockResolvedValue(undefined);
  const mockOnError = vi.fn();

  const defaultProps = {
    botId: "test-bot",
    isRunning: true,
    activeTab: "terminal" as string,
    isLoading: false,
    restartBot: mockRestartBot,
    onError: mockOnError,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers restart when running → stopped on terminal tab", () => {
    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: defaultProps }
    );

    rerender({ ...defaultProps, isRunning: false });

    expect(mockRestartBot).toHaveBeenCalledWith("test-bot");
    expect(mockRestartBot).toHaveBeenCalledTimes(1);
  });

  it("does NOT restart again after first auto-restart (prevents loop)", () => {
    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: defaultProps }
    );

    // First crash → auto-restart fires
    rerender({ ...defaultProps, isRunning: false });
    expect(mockRestartBot).toHaveBeenCalledTimes(1);

    // Container comes back
    rerender({ ...defaultProps, isRunning: true });

    // Second crash → should NOT auto-restart (one-shot guard)
    rerender({ ...defaultProps, isRunning: false });
    expect(mockRestartBot).toHaveBeenCalledTimes(1); // still 1
  });

  it("does NOT restart when not on terminal tab", () => {
    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: { ...defaultProps, activeTab: "logs" } }
    );

    rerender({ ...defaultProps, activeTab: "logs", isRunning: false });

    expect(mockRestartBot).not.toHaveBeenCalled();
  });

  it("does NOT restart when action is loading", () => {
    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: { ...defaultProps, isLoading: true } }
    );

    rerender({ ...defaultProps, isLoading: true, isRunning: false });

    expect(mockRestartBot).not.toHaveBeenCalled();
  });

  it("does NOT restart when bot was already stopped", () => {
    // Start in stopped state
    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: { ...defaultProps, isRunning: false } }
    );

    // Still stopped → no transition
    rerender({ ...defaultProps, isRunning: false });

    expect(mockRestartBot).not.toHaveBeenCalled();
  });

  it("resetAutoRestart re-arms the guard for a new auto-restart", () => {
    const { rerender, result } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: defaultProps }
    );

    // First crash → auto-restart fires
    rerender({ ...defaultProps, isRunning: false });
    expect(mockRestartBot).toHaveBeenCalledTimes(1);

    // User manually resets (called by handleStart/handleStop)
    act(() => result.current.resetAutoRestart());

    // Container comes back
    rerender({ ...defaultProps, isRunning: true });

    // Second crash → auto-restart fires again because guard was reset
    rerender({ ...defaultProps, isRunning: false });
    expect(mockRestartBot).toHaveBeenCalledTimes(2);
  });

  it("calls onError when restartBot rejects", async () => {
    mockRestartBot.mockRejectedValueOnce(new Error("restart failed"));

    const { rerender } = renderHook(
      (props) => useAutoRestart(props),
      { initialProps: defaultProps }
    );

    rerender({ ...defaultProps, isRunning: false });

    // Wait for the promise rejection to propagate
    await vi.waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith("Error: restart failed");
    });
  });
});
