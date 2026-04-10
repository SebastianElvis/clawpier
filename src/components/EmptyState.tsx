import { Bot, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateBot: () => void;
}

export function EmptyState({ onCreateBot }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="rounded-2xl bg-[var(--bg-hover)] p-5">
        <Bot className="h-12 w-12 text-[var(--text-tertiary)]" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">No bots yet</h2>
      <p className="mt-1.5 max-w-xs text-center text-sm text-[var(--text-secondary)]">
        Create your first sandboxed bot to get started.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        onClick={onCreateBot}
      >
        <Plus className="h-4 w-4" />
        Create your first bot
      </button>
    </div>
  );
}
