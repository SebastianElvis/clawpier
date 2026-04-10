import { useEffect } from "react";

type Tab = "dashboard" | "chat" | "skills" | "terminal" | "files" | "docker";

interface KeyboardShortcutsConfig {
  /** The currently selected bot (null = no detail view open) */
  selectedBotId: string | null;
  /** Whether the selected bot is running */
  isRunning: boolean;
  /** Whether an action is in progress for the selected bot */
  isLoading: boolean;
  /** Close bot detail view */
  onBack: () => void;
  /** Switch tab in bot detail view */
  onTabChange: (tab: Tab) => void;
  /** Start the selected bot */
  onStartBot: () => void;
  /** Stop the selected bot */
  onStopBot: () => void;
  /** Restart the selected bot */
  onRestartBot: () => void;
}

const TAB_MAP: Record<string, Tab> = {
  "1": "dashboard",
  "2": "chat",
  "3": "skills",
  "4": "terminal",
  "5": "files",
  "6": "docker",
};

function isInsideInteractiveElement(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  // Input or textarea
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;

  // Contenteditable
  if (el instanceof HTMLElement && el.isContentEditable) return true;

  // Inside xterm terminal
  if (el.closest(".xterm")) return true;

  return false;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const {
    selectedBotId,
    isRunning,
    isLoading,
    onBack,
    onTabChange,
    onStartBot,
    onStopBot,
    onRestartBot,
  } = config;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle shortcuts when bot detail is open
      if (!selectedBotId) return;

      // Escape always works (even in inputs) to go back
      if (e.key === "Escape" && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        // Don't capture Escape if inside an xterm terminal
        if (document.activeElement?.closest(".xterm")) return;
        e.preventDefault();
        onBack();
        return;
      }

      // All remaining shortcuts require Cmd/Meta
      if (!e.metaKey) return;

      // Skip if inside interactive element (input, textarea, terminal)
      if (isInsideInteractiveElement()) return;

      // Cmd+W — close detail view
      if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        onBack();
        return;
      }

      // Cmd+1 through Cmd+6 — switch tabs
      const tab = TAB_MAP[e.key];
      if (tab && !e.shiftKey) {
        e.preventDefault();
        onTabChange(tab);
        return;
      }

      // Cmd+Shift+S — start bot (only when stopped)
      if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        if (!isRunning && !isLoading) {
          onStartBot();
        }
        return;
      }

      // Cmd+Shift+X — stop bot (only when running)
      if (e.key === "x" && e.shiftKey) {
        e.preventDefault();
        if (isRunning && !isLoading) {
          onStopBot();
        }
        return;
      }

      // Cmd+R — restart bot (only when running)
      if (e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        if (isRunning && !isLoading) {
          onRestartBot();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedBotId, isRunning, isLoading, onBack, onTabChange, onStartBot, onStopBot, onRestartBot]);
}
