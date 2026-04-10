import { Bot, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateBot: () => void;
}

export function EmptyState({ onCreateBot }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Bot className="h-14 w-14 text-[var(--text-tertiary)]" />
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">No bots yet</h2>
      <p className="mt-1.5 max-w-xs text-center text-sm text-[var(--text-secondary)]">
        Create your first sandboxed bot to get started.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
        onClick={onCreateBot}
      >
        <Plus className="h-4 w-4" />
        Create your first bot
      </button>
      <p className="mt-3 text-xs text-[var(--text-tertiary)]">
        Press <kbd className="rounded border border-[var(--border-primary)] bg-[var(--bg-hover)] px-1 py-0.5 font-mono text-[10px]">⌘N</kbd> anytime to create a bot
      </p>
    </div>
  );
}
