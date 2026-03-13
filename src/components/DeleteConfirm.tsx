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
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Delete "{botName}"?
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              This will stop the bot if running and permanently remove it. This
              action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
