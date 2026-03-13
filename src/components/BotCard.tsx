import { useState } from "react";
import {
  Play,
  Square,
  Trash2,
  Loader2,
  FolderOpen,
  MoreVertical,
  WifiOff,
  Wifi,
  ChevronRight,
  Cpu,
  HardDrive,
} from "lucide-react";
import type { BotWithStatus } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { useContainerStats } from "../hooks/use-container-stats";
import { StatusBadge } from "./StatusBadge";
import { NetworkBadge } from "./NetworkBadge";
import { DeleteConfirm } from "./DeleteConfirm";

interface BotCardProps {
  bot: BotWithStatus;
  onSelect: () => void;
}

export function BotCard({ bot, onSelect }: BotCardProps) {
  const { startBot, stopBot, renameBot, toggleNetwork, actionInProgress } =
    useBotStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(bot.name);
  const [showDelete, setShowDelete] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoading = actionInProgress.has(bot.id);
  const isRunning = bot.status.type === "Running";
  const stats = useContainerStats(bot.id, isRunning);

  const handleStart = async () => {
    setError(null);
    try {
      await startBot(bot.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      await stopBot(bot.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRename = async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== bot.name) {
      try {
        await renameBot(bot.id, trimmed);
      } catch (e) {
        setEditName(bot.name);
        setError(String(e));
      }
    } else {
      setEditName(bot.name);
    }
    setIsEditing(false);
  };

  const handleToggleNetwork = async () => {
    setShowMenu(false);
    try {
      await toggleNetwork(bot.id, !bot.network_enabled);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <div className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                className="w-full rounded border border-blue-300 px-2 py-0.5 text-sm font-semibold outline-none ring-2 ring-blue-100"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setEditName(bot.name);
                    setIsEditing(false);
                  }
                }}
                autoFocus
              />
            ) : (
              <h3
                className="truncate text-sm font-semibold text-gray-900 cursor-pointer"
                onDoubleClick={() => {
                  setEditName(bot.name);
                  setIsEditing(true);
                }}
                title="Double-click to rename"
              >
                {bot.name}
              </h3>
            )}
            <p className="mt-0.5 truncate text-xs text-gray-400">
              {bot.image.split("/").pop()}
            </p>
          </div>

          {/* Menu button */}
          <div className="relative">
            <button
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={handleToggleNetwork}
                  >
                    {bot.network_enabled ? (
                      <>
                        <WifiOff className="h-3.5 w-3.5" />
                        Disable network
                      </>
                    ) : (
                      <>
                        <Wifi className="h-3.5 w-3.5" />
                        Enable network
                      </>
                    )}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setShowMenu(false);
                      setShowDelete(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete bot
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={bot.status} />
          {bot.network_enabled && <NetworkBadge />}
          {bot.workspace_path && (
            <span
              className="inline-flex items-center gap-1 text-xs text-gray-400"
              title={bot.workspace_path}
            >
              <FolderOpen className="h-3 w-3" />
              {bot.workspace_path.split("/").pop()}
            </span>
          )}
        </div>

        {/* Mini stats (when running) */}
        {isRunning && stats && (
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <div className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              <span>{stats.cpu_percent.toFixed(1)}%</span>
              <div className="h-1 w-10 rounded-full bg-gray-200">
                <div
                  className="h-1 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${Math.min(stats.cpu_percent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              <span>{stats.memory_percent.toFixed(1)}%</span>
              <div className="h-1 w-10 rounded-full bg-gray-200">
                <div
                  className="h-1 rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${Math.min(stats.memory_percent, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {isRunning ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
              onClick={handleStop}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Stop
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Start
            </button>
          )}

          {/* Open detail view */}
          <button
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            onClick={onSelect}
          >
            Open
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showDelete && (
        <DeleteConfirm
          botName={bot.name}
          botId={bot.id}
          onClose={() => setShowDelete(false)}
        />
      )}
    </>
  );
}
