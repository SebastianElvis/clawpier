export interface WindowState {
  selectedBotId?: string;
  activeTab?: string;
  logPanelOpen?: boolean;
  logPanelHeight?: number;
}

const STORAGE_KEY = "clawpier-window-state";

export function loadWindowState(): WindowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as WindowState;
  } catch {
    return {};
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function saveWindowState(partial: Partial<WindowState>): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    try {
      const current = loadWindowState();
      const merged = { ...current, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Silently ignore storage errors
    }
  }, 100);
}

/**
 * Immediately flush any pending debounced save.
 * Useful in tests or before the window unloads.
 */
export function flushWindowState(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
