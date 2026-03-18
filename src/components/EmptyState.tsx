import { Bot, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateBot: () => void;
}

export function EmptyState({ onCreateBot }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="rounded-2xl bg-gray-50 p-5">
        <Bot className="h-12 w-12 text-gray-300" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-gray-900">No bots yet</h2>
      <p className="mt-1.5 max-w-xs text-center text-sm text-gray-500">
        Create your first bot to get started.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        onClick={onCreateBot}
      >
        <Plus className="h-4 w-4" />
        New Bot
      </button>
    </div>
  );
}
