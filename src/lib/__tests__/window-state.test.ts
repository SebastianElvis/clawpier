import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { loadWindowState, saveWindowState, flushWindowState } from "../window-state";

beforeEach(() => {
  localStorage.clear();
  flushWindowState();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("window-state", () => {
  describe("loadWindowState", () => {
    it("returns empty object when nothing is stored", () => {
      expect(loadWindowState()).toEqual({});
    });

    it("returns parsed state from localStorage", () => {
      localStorage.setItem(
        "clawpier-window-state",
        JSON.stringify({ selectedBotId: "bot-1", activeTab: "terminal" })
      );

      const state = loadWindowState();
      expect(state.selectedBotId).toBe("bot-1");
      expect(state.activeTab).toBe("terminal");
    });

    it("returns empty object for invalid JSON", () => {
      localStorage.setItem("clawpier-window-state", "not-json");
      expect(loadWindowState()).toEqual({});
    });
  });

  describe("saveWindowState", () => {
    it("saves state after debounce", () => {
      saveWindowState({ selectedBotId: "bot-1" });

      // Not yet saved
      expect(localStorage.getItem("clawpier-window-state")).toBeNull();

      vi.advanceTimersByTime(100);

      const stored = JSON.parse(localStorage.getItem("clawpier-window-state")!);
      expect(stored.selectedBotId).toBe("bot-1");
    });

    it("merges with existing state", () => {
      localStorage.setItem(
        "clawpier-window-state",
        JSON.stringify({ selectedBotId: "bot-1", activeTab: "dashboard" })
      );

      saveWindowState({ activeTab: "terminal" });
      vi.advanceTimersByTime(100);

      const stored = JSON.parse(localStorage.getItem("clawpier-window-state")!);
      expect(stored.selectedBotId).toBe("bot-1");
      expect(stored.activeTab).toBe("terminal");
    });

    it("debounces multiple saves", () => {
      saveWindowState({ selectedBotId: "bot-1" });
      saveWindowState({ selectedBotId: "bot-2" });
      saveWindowState({ selectedBotId: "bot-3" });

      vi.advanceTimersByTime(100);

      const stored = JSON.parse(localStorage.getItem("clawpier-window-state")!);
      expect(stored.selectedBotId).toBe("bot-3");
    });

    it("persists logPanelOpen and logPanelHeight", () => {
      saveWindowState({ logPanelOpen: true, logPanelHeight: 400 });
      vi.advanceTimersByTime(100);

      const stored = JSON.parse(localStorage.getItem("clawpier-window-state")!);
      expect(stored.logPanelOpen).toBe(true);
      expect(stored.logPanelHeight).toBe(400);
    });
  });

  describe("flushWindowState", () => {
    it("cancels pending debounce timer", () => {
      saveWindowState({ selectedBotId: "bot-1" });
      flushWindowState();
      vi.advanceTimersByTime(200);

      // Nothing should have been saved since we flushed (cancelled) the timer
      expect(localStorage.getItem("clawpier-window-state")).toBeNull();
    });
  });
});
