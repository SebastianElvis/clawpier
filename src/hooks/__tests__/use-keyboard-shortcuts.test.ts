import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKeyboardShortcuts } from "../use-keyboard-shortcuts";

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  // Spy on preventDefault
  const preventDefaultSpy = vi.spyOn(event, "preventDefault");
  window.dispatchEvent(event);
  return { event, preventDefaultSpy };
}

describe("useKeyboardShortcuts", () => {
  const defaultConfig = {
    selectedBotId: "bot-1",
    isRunning: false,
    isLoading: false,
    onBack: vi.fn(),
    onTabChange: vi.fn(),
    onStartBot: vi.fn(),
    onStopBot: vi.fn(),
    onRestartBot: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset activeElement to body
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  it("does nothing when no bot is selected", () => {
    renderHook(() =>
      useKeyboardShortcuts({ ...defaultConfig, selectedBotId: null })
    );

    fireKey("1", { metaKey: true });
    fireKey("Escape");
    fireKey("w", { metaKey: true });

    expect(defaultConfig.onTabChange).not.toHaveBeenCalled();
    expect(defaultConfig.onBack).not.toHaveBeenCalled();
  });

  describe("tab navigation (Cmd+1 through Cmd+5)", () => {
    it("Cmd+1 switches to dashboard", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      const { preventDefaultSpy } = fireKey("1", { metaKey: true });
      expect(defaultConfig.onTabChange).toHaveBeenCalledWith("dashboard");
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("Cmd+2 switches to chat", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      fireKey("2", { metaKey: true });
      expect(defaultConfig.onTabChange).toHaveBeenCalledWith("chat");
    });

    it("Cmd+3 switches to terminal", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      fireKey("3", { metaKey: true });
      expect(defaultConfig.onTabChange).toHaveBeenCalledWith("terminal");
    });

    it("Cmd+4 switches to files", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      fireKey("4", { metaKey: true });
      expect(defaultConfig.onTabChange).toHaveBeenCalledWith("files");
    });

    it("Cmd+5 switches to docker", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      fireKey("5", { metaKey: true });
      expect(defaultConfig.onTabChange).toHaveBeenCalledWith("docker");
    });

    it("Cmd+6 does not trigger tab change", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      fireKey("6", { metaKey: true });
      expect(defaultConfig.onTabChange).not.toHaveBeenCalled();
    });
  });

  describe("close/back shortcuts", () => {
    it("Cmd+W triggers back", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      const { preventDefaultSpy } = fireKey("w", { metaKey: true });
      expect(defaultConfig.onBack).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("Escape triggers back", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));
      const { preventDefaultSpy } = fireKey("Escape");
      expect(defaultConfig.onBack).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe("action shortcuts", () => {
    it("Cmd+Shift+S triggers start when bot is stopped", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: false })
      );
      const { preventDefaultSpy } = fireKey("s", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStartBot).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("Cmd+Shift+S does NOT trigger start when bot is running", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: true })
      );
      fireKey("s", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStartBot).not.toHaveBeenCalled();
    });

    it("Cmd+Shift+S does NOT trigger start when action is loading", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: false, isLoading: true })
      );
      fireKey("s", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStartBot).not.toHaveBeenCalled();
    });

    it("Cmd+Shift+X triggers stop when bot is running", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: true })
      );
      const { preventDefaultSpy } = fireKey("x", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStopBot).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("Cmd+Shift+X does NOT trigger stop when bot is stopped", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: false })
      );
      fireKey("x", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStopBot).not.toHaveBeenCalled();
    });

    it("Cmd+Shift+X does NOT trigger stop when action is loading", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: true, isLoading: true })
      );
      fireKey("x", { metaKey: true, shiftKey: true });
      expect(defaultConfig.onStopBot).not.toHaveBeenCalled();
    });

    it("Cmd+R triggers restart when bot is running", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: true })
      );
      const { preventDefaultSpy } = fireKey("r", { metaKey: true });
      expect(defaultConfig.onRestartBot).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("Cmd+R does NOT trigger restart when bot is stopped", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: false })
      );
      fireKey("r", { metaKey: true });
      expect(defaultConfig.onRestartBot).not.toHaveBeenCalled();
    });

    it("Cmd+R does NOT trigger restart when action is loading", () => {
      renderHook(() =>
        useKeyboardShortcuts({ ...defaultConfig, isRunning: true, isLoading: true })
      );
      fireKey("r", { metaKey: true });
      expect(defaultConfig.onRestartBot).not.toHaveBeenCalled();
    });
  });

  describe("input suppression", () => {
    it("suppresses Cmd shortcuts when focus is in an input", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireKey("1", { metaKey: true });
      fireKey("w", { metaKey: true });
      fireKey("r", { metaKey: true });

      expect(defaultConfig.onTabChange).not.toHaveBeenCalled();
      expect(defaultConfig.onBack).not.toHaveBeenCalled();
      expect(defaultConfig.onRestartBot).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it("suppresses Cmd shortcuts when focus is in a textarea", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      fireKey("1", { metaKey: true });
      expect(defaultConfig.onTabChange).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it("suppresses Cmd shortcuts when focus is inside .xterm", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));

      const xtermContainer = document.createElement("div");
      xtermContainer.className = "xterm";
      const innerEl = document.createElement("div");
      innerEl.tabIndex = 0;
      xtermContainer.appendChild(innerEl);
      document.body.appendChild(xtermContainer);
      innerEl.focus();

      fireKey("1", { metaKey: true });
      expect(defaultConfig.onTabChange).not.toHaveBeenCalled();

      document.body.removeChild(xtermContainer);
    });

    it("Escape does NOT fire when focus is inside .xterm", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));

      const xtermContainer = document.createElement("div");
      xtermContainer.className = "xterm";
      const innerEl = document.createElement("div");
      innerEl.tabIndex = 0;
      xtermContainer.appendChild(innerEl);
      document.body.appendChild(xtermContainer);
      innerEl.focus();

      fireKey("Escape");
      expect(defaultConfig.onBack).not.toHaveBeenCalled();

      document.body.removeChild(xtermContainer);
    });

    it("Escape still works when focus is in an input (not xterm)", () => {
      renderHook(() => useKeyboardShortcuts(defaultConfig));

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireKey("Escape");
      expect(defaultConfig.onBack).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });
  });
});
