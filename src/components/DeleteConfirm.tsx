import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useBotStore } from "../stores/bot-store";

interface DeleteConfirmProps {
  botName: string;
  botId: string;
  onClose: () => void;
}

export function DeleteConfirm({ botName, botId, onClose }: DeleteConfirmProps) {
  const deleteBot = useBotStore((s) => s.deleteBot);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteBot(botId);
      onClose();
    } catch (e) {
      console.error("Failed to delete bot:", e);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-elevated)] p-6 shadow-2xl ring-1 ring-[var(--border-secondary)]">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-[var(--badge-red-bg)] p-2">
            <AlertTriangle className="h-5 w-5 text-[var(--badge-red-text)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Delete "{botName}"?
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              This will stop the bot if running and permanently remove it. This
              action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--btn-danger-bg)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--btn-danger-hover-bg)] disabled:opacity-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
