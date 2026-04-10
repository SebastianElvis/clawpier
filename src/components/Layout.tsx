import { useEffect, useState } from "react";
import { Plus, Sun, Moon, Monitor } from "lucide-react";
import { getAppVersion } from "../lib/tauri";
import {
  getThemePreference,
  setThemePreference,
  applyTheme,
  type ThemePreference,
} from "../lib/theme";
import { NotificationCenter } from "./NotificationCenter";

interface LayoutProps {
  children: React.ReactNode;
  onCreateBot: () => void;
  botCount: number;
}

export function Layout({ children, onCreateBot, botCount }: LayoutProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);

  useEffect(() => {
    getAppVersion().then((v) => setVersion(v));
  }, []);

  // Apply theme on mount
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const cycleTheme = () => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    setThemePreference(next);
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with drag region */}
      <header
        className="flex shrink-0 items-center justify-between bg-[var(--bg-surface)] px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-3" data-tauri-drag-region>
          <h1
            className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
            data-tauri-drag-region
          >
            ClawPier
          </h1>
          {version && (
            <span className="text-[10px] text-[var(--text-tertiary)]" data-tauri-drag-region>
              v{version}
            </span>
          )}
          {botCount > 0 && (
            <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
              {botCount} bot{botCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <button
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
          {botCount > 0 && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
              onClick={onCreateBot}
              title="New Bot (⌘N)"
            >
              <Plus className="h-3.5 w-3.5" />
              New Bot
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
