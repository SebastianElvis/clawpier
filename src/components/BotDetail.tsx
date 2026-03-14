import { useState } from "react";
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Terminal,
  ScrollText,
  FolderOpen,
  Settings,
  Cpu,
  HardDrive,
} from "lucide-react";
import type { BotWithStatus } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { useContainerStats } from "../hooks/use-container-stats";
import { useContainerLogs } from "../hooks/use-container-logs";
import { useInteractiveTerminal } from "../hooks/use-interactive-terminal";
import { LogViewer } from "./LogViewer";
import { EnvVarEditor } from "./EnvVarEditor";
import { FileBrowser } from "./FileBrowser";
import { StatusBadge } from "./StatusBadge";
import { NetworkBadge } from "./NetworkBadge";

type Tab = "logs" | "terminal" | "files" | "settings";

interface BotDetailProps {
  bot: BotWithStatus;
  onBack: () => void;
}

export function BotDetail({ bot, onBack }: BotDetailProps) {
  const { startBot, stopBot, actionInProgress } = useBotStore();
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [error, setError] = useState<string | null>(null);

  const isRunning = bot.status.type === "Running";
  const isLoading = actionInProgress.has(bot.id);

  // Stats streaming (only when running)
  const stats = useContainerStats(bot.id, isRunning);

  // Log streaming (only when running and on logs/terminal tab)
  const { logs, clearLogs } = useContainerLogs(
    bot.id,
    isRunning && (activeTab === "logs" || activeTab === "terminal")
  );

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

  const tabs: { key: Tab; label: string; icon: typeof ScrollText }[] = [
    { key: "logs", label: "Logs", icon: ScrollText },
    { key: "terminal", label: "Terminal", icon: Terminal },
    { key: "files", label: "Files", icon: FolderOpen },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {bot.name}
            </h1>
            <p className="truncate text-xs text-gray-400">
              {bot.image.split("/").pop()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={bot.status} />
            {bot.network_enabled && <NetworkBadge />}
          </div>

          {/* Start/Stop button */}
          {isRunning ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
        </div>

        {/* Stats bar (when running) */}
        {isRunning && stats && (
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              <span>CPU {stats.cpu_percent.toFixed(1)}%</span>
              <div className="h-1.5 w-16 rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${Math.min(stats.cpu_percent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              <span>
                MEM {formatBytes(stats.memory_usage)} /{" "}
                {formatBytes(stats.memory_limit)}
              </span>
              <div className="h-1.5 w-16 rounded-full bg-gray-200">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${Math.min(stats.memory_percent, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab(key)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === "logs" && (
          <LogViewer logs={logs} onClear={clearLogs} />
        )}
        {activeTab === "terminal" && (
          <TerminalTab botId={bot.id} isRunning={isRunning} />
        )}
        {activeTab === "files" && (
          bot.workspace_path ? (
            <FileBrowser
              botId={bot.id}
              workspacePath={bot.workspace_path}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No workspace path configured. Set one in Settings.
            </div>
          )
        )}
        {activeTab === "settings" && (
          <div className="overflow-y-auto p-4">
            <EnvVarEditor botId={bot.id} envVars={bot.env_vars ?? []} />

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">
                Bot Information
              </h3>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>ID</span>
                  <span className="font-mono text-gray-600">{bot.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Image</span>
                  <span className="font-mono text-gray-600">{bot.image}</span>
                </div>
                <div className="flex justify-between">
                  <span>Network</span>
                  <span
                    className={
                      bot.network_enabled ? "text-orange-600" : "text-gray-600"
                    }
                  >
                    {bot.network_enabled ? "Enabled" : "Disabled (sandboxed)"}
                  </span>
                </div>
                {bot.workspace_path && (
                  <div className="flex justify-between">
                    <span>Workspace</span>
                    <span className="font-mono text-gray-600">
                      {bot.workspace_path}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Terminal Tab ──────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: "openclaw configure", command: "openclaw configure" },
  { label: "openclaw --help", command: "openclaw --help" },
  { label: "ls /workspace", command: "ls /workspace" },
  { label: "env", command: "env" },
];

function TerminalTab({
  botId,
  isRunning,
}: {
  botId: string;
  isRunning: boolean;
}) {
  const { containerRef, isConnected, isConnecting, writeCommand } =
    useInteractiveTerminal({ botId, isRunning });

  if (!isRunning) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
        <Terminal className="h-8 w-8 text-gray-300" />
        Start the bot to use the terminal
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Quick command chips */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
          Quick:
        </span>
        {QUICK_COMMANDS.map((qc) => (
          <button
            key={qc.command}
            className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
            onClick={() => writeCommand(qc.command)}
            disabled={!isConnected}
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Terminal container */}
      <div className="relative min-h-0 flex-1 bg-[#030712]">
        {isConnecting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting to container...
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="h-full w-full p-1"
        />
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
