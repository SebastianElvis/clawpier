import type { BotStatus } from "../lib/types";

interface StatusBadgeProps {
  status: BotStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status.type) {
    case "Running":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 status-pulse" />
          Running
        </span>
      );
    case "Stopped":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          Stopped
        </span>
      );
    case "Error":
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 cursor-help"
          title={status.message}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Error
        </span>
      );
  }
}
