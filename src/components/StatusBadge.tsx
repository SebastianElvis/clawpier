import type { BotStatus } from "../lib/types";

interface StatusBadgeProps {
  status: BotStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status.type) {
    case "Running":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-green-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--badge-green-text)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 status-pulse" />
          Running
        </span>
      );
    case "Stopped":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-hover)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
          Stopped
        </span>
      );
    case "Error":
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-red-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--badge-red-text)] cursor-help"
          title={status.message}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Error
        </span>
      );
  }
}
