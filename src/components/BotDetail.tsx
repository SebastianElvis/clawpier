import { useState, useRef } from "react";
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Terminal,
  ScrollText,
  FolderOpen,
  Settings,
  Send,
  Cpu,
  HardDrive,
} from "lucide-react";
import type { BotWithStatus, ExecResult } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { useContainerStats } from "../hooks/use-container-stats";
import { useContainerLogs } from "../hooks/use-container-logs";
import { LogViewer } from "./LogViewer";
import { EnvVarEditor } from "./EnvVarEditor";
import { FileBrowser } from "./FileBrowser";
import { StatusBadge } from "./StatusBadge";
import { NetworkBadge } from "./NetworkBadge";
import * as api from "../lib/tauri";

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
function TerminalTab({
  botId,
  isRunning,
}: {
  botId: string;
  isRunning: boolean;
}) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<
    { command: string; result: ExecResult }[]
  >([]);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleExec = async () => {
    const cmd = command.trim();
    if (!cmd || !isRunning) return;

    setCommand("");
    setExecuting(true);
    try {
      const result = await api.execCommand(botId, cmd);
      setHistory((prev) => [...prev, { command: cmd, result }]);
      // Scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (e) {
      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          result: { output: String(e), exit_code: -1 },
        },
      ]);
    } finally {
      setExecuting(false);
    }
  };

  if (!isRunning) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Start the bot to use the terminal
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-950 p-3 font-mono text-xs leading-5"
      >
        {history.length === 0 ? (
          <div className="text-gray-600">
            Type a command below to run it inside the container.
          </div>
        ) : (
          history.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="text-blue-400">$ {entry.command}</div>
              <div
                className={`whitespace-pre-wrap ${
                  entry.result.exit_code !== 0
                    ? "text-red-400"
                    : "text-gray-200"
                }`}
              >
                {entry.result.output || "(no output)"}
              </div>
              {entry.result.exit_code !== null &&
                entry.result.exit_code !== 0 && (
                  <div className="text-gray-600">
                    exit code: {entry.result.exit_code}
                  </div>
                )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-gray-800 bg-gray-950 px-3 py-2">
        <span className="text-xs text-blue-400">$</span>
        <input
          className="flex-1 bg-transparent font-mono text-xs text-gray-200 outline-none placeholder:text-gray-600"
          placeholder="Enter command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !executing) handleExec();
          }}
          disabled={executing}
        />
        <button
          className="rounded p-1 text-gray-500 hover:text-blue-400 disabled:opacity-30"
          onClick={handleExec}
          disabled={executing || !command.trim()}
        >
          {executing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
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
