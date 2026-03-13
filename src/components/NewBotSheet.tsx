import { useState } from "react";
import { X, FolderOpen, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useBotStore } from "../stores/bot-store";

interface NewBotSheetProps {
  onClose: () => void;
}

export function NewBotSheet({ onClose }: NewBotSheetProps) {
  const { createBot, bots } = useBotStore();
  const [name, setName] = useState("");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDuplicate = bots.some(
    (b) => b.name.toLowerCase() === name.trim().toLowerCase()
  );

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setWorkspacePath(selected as string);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isDuplicate) return;

    setCreating(true);
    setError(null);
    try {
      await createBot(trimmed, workspacePath ?? undefined);
      onClose();
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">New Bot</h2>
          <button
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Name field */}
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Bot name <span className="text-red-500">*</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="e.g., research-assistant"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {isDuplicate && (
              <p className="mt-1 text-xs text-red-600">
                A bot with this name already exists.
              </p>
            )}
          </div>

          {/* Workspace folder */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">
              Workspace folder{" "}
              <span className="text-gray-400">(optional)</span>
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handlePickFolder}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {workspacePath ? "Change folder" : "Choose folder"}
              </button>
              {workspacePath && (
                <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                  {workspacePath}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              This folder will be mounted read-write inside the container at
              /workspace.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              onClick={onClose}
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!name.trim() || isDuplicate || creating}
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Bot
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
