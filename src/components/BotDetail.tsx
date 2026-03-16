import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Terminal,
  ScrollText,
  FolderOpen,
  Cpu,
  HardDrive,
  RotateCw,
  RefreshCw,
  LayoutDashboard,
  X,
  MessageSquare,
  AlertTriangle,
  Box,
  Save,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { BotWithStatus, NetworkMode, PortMapping, EnvVar } from "../lib/types";
import * as api from "../lib/tauri";
import { useBotStore } from "../stores/bot-store";
import { useContainerStats } from "../hooks/use-container-stats";
import { useContainerLogs } from "../hooks/use-container-logs";
import { useInteractiveTerminal } from "../hooks/use-interactive-terminal";
import { LogViewer } from "./LogViewer";
import { EnvVarEditor } from "./EnvVarEditor";
import { FileBrowser } from "./FileBrowser";
import { ConfigDashboard } from "./ConfigDashboard";
import { StatusBadge } from "./StatusBadge";
import { NetworkBadge } from "./NetworkBadge";
import { Sparkline } from "./Sparkline";
import { ResourceLimitsEditor } from "./ResourceLimitsEditor";
import { NetworkModePicker } from "./NetworkModePicker";
import { PortMappingEditor } from "./PortMappingEditor";
import { ChatTab } from "./ChatTab";
import { useAutoRestart } from "../hooks/use-auto-restart";
import { useRestartProgress } from "../hooks/use-restart-progress";
import { ErrorBoundary } from "./ErrorBoundary";

type Tab = "dashboard" | "chat" | "logs" | "terminal" | "files" | "docker";

interface BotDetailProps {
  bot: BotWithStatus;
  onBack: () => void;
}

export function BotDetail({ bot, onBack }: BotDetailProps) {
  const { startBot, stopBot, restartBot, actionInProgress } =
    useBotStore();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [error, setError] = useState<string | null>(null);

  const isRunning = bot.status.type === "Running";
  const isLoading = actionInProgress.has(bot.id);

  // Auto-restart once when container stops unexpectedly while terminal is active.
  // The one-shot guard prevents restart loops if the container keeps crashing.
  const { resetAutoRestart } = useAutoRestart({
    botId: bot.id,
    isRunning,
    activeTab,
    isLoading,
    restartBot,
    onError: setError,
  });

  // Stats streaming (only when running)
  const { stats, statsHistory } = useContainerStats(bot.id, isRunning);

  // Log streaming (always when running — persists across tab switches)
  const { logs, clearLogs } = useContainerLogs(bot.id, isRunning);

  // Restart progress overlay
  const { phase, isRestarting } = useRestartProgress(bot.id);

  const handleStart = async () => {
    setError(null);
    resetAutoRestart();
    try {
      await startBot(bot.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async () => {
    setError(null);
    resetAutoRestart();
    try {
      await stopBot(bot.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRestart = async () => {
    setError(null);
    try {
      await restartBot(bot.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const networkMode = bot.network_mode;
  const hasNetwork = networkMode !== "none";

  const tabs: { key: Tab; label: string; icon: typeof ScrollText; runningOnly?: boolean }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "chat", label: "Chat", icon: MessageSquare, runningOnly: true },
    { key: "terminal", label: "Terminal", icon: Terminal },
    { key: "files", label: "Files", icon: FolderOpen },
    { key: "logs", label: "Logs", icon: ScrollText },
    { key: "docker", label: "Docker", icon: Box },
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
            {hasNetwork && <NetworkBadge mode={networkMode} />}
          </div>

          {/* Start/Stop/Restart buttons */}
          {isRunning ? (
            <>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                onClick={handleRestart}
                disabled={isLoading}
                title="Restart container"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                Restart
              </button>
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
            </>
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

        {/* Stats bar with sparklines (when running) */}
        {isRunning && stats && (
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              <span>
                CPU {stats.cpu_percent.toFixed(1)}%
                {bot.cpu_limit != null && (
                  <span className="ml-1 text-gray-400">
                    · {bot.cpu_limit} {bot.cpu_limit === 1 ? "core" : "cores"}
                  </span>
                )}
              </span>
              <Sparkline
                data={statsHistory.map((s) => s.cpu_percent)}
                max={100}
                color="#3b82f6"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              <span>
                MEM {formatBytes(stats.memory_usage)} /{" "}
                {formatBytes(stats.memory_limit)}
              </span>
              <Sparkline
                data={statsHistory.map((s) => s.memory_percent)}
                max={100}
                color="#10b981"
              />
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
        {tabs.map(({ key, label, icon: Icon, runningOnly }) => {
          if (runningOnly && !isRunning) return null;
          return (
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
          );
        })}
      </div>

      {/* Tab content */}
      <div className="relative min-h-0 flex-1">
        {/* Restart overlay */}
        {isRestarting && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-xl bg-gray-800 p-6 text-center shadow-xl">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
              <p className="mb-1 font-medium text-white">Restarting bot...</p>
              <p className="text-sm text-gray-400">
                {phase === "stopping" && "Stopping container..."}
                {phase === "stopped" && "Container stopped"}
                {phase === "starting" && "Starting container..."}
                {phase === "running" && "Bot is ready!"}
              </p>
            </div>
          </div>
        )}
        {activeTab === "dashboard" && (
          <ErrorBoundary fallbackTitle="Dashboard error">
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <ConfigDashboard
                  botId={bot.id}
                  isRunning={isRunning}
                  onSwitchToTerminal={() => setActiveTab("terminal")}
                />
              </div>
              {/* Bot Information */}
              <div className="border-t border-gray-200 px-4 py-2">
                <div className="flex items-center gap-6 text-xs text-gray-400">
                  <span>
                    ID{" "}
                    <span className="font-mono text-gray-500">{bot.id}</span>
                  </span>
                  <span>
                    Image{" "}
                    <span className="font-mono text-gray-500">{bot.image}</span>
                  </span>
                </div>
              </div>
            </div>
          </ErrorBoundary>
        )}
        {activeTab === "chat" && isRunning && (
          <ErrorBoundary fallbackTitle="Chat error">
            <ChatTab botId={bot.id} />
          </ErrorBoundary>
        )}
        {activeTab === "logs" && (
          <ErrorBoundary fallbackTitle="Logs error">
            <LogViewer logs={logs} onClear={clearLogs} />
          </ErrorBoundary>
        )}
        {activeTab === "terminal" && (
          <ErrorBoundary fallbackTitle="Terminal error">
            <TerminalTab botId={bot.id} isRunning={isRunning} />
          </ErrorBoundary>
        )}
        {activeTab === "files" && (
          <ErrorBoundary fallbackTitle="Files error">
            {bot.workspace_path ? (
              <FileBrowser
                botId={bot.id}
                workspacePath={bot.workspace_path}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-400">
                <FolderOpen className="h-8 w-8 text-gray-300" />
                <p>No workspace path configured.</p>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  onClick={() => setActiveTab("docker")}
                >
                  <Box className="h-3.5 w-3.5" />
                  Go to Docker
                </button>
              </div>
            )}
          </ErrorBoundary>
        )}
        {activeTab === "docker" && (
          <ErrorBoundary fallbackTitle="Docker settings error">
            <DockerTab bot={bot} isRunning={isRunning} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

// ── Docker Tab ───────────────────────────────────────────────────────

const MB = 1024 * 1024;
const GB = 1024 * MB;
const MIN_CPU = 2;
const MIN_MEM = 4 * GB;

const EMPTY_ENV_VARS: EnvVar[] = [];

function DockerTab({
  bot,
  isRunning,
}: {
  bot: BotWithStatus;
  isRunning: boolean;
}) {
  const {
    updateResourceLimits,
    setNetworkMode: storeSetNetworkMode,
    updatePortMappings,
    updateEnvVars,
    setWorkspacePath,
    restartBot,
  } = useBotStore();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // System resources for slider bounds
  const [maxCpu, setMaxCpu] = useState(8);
  const [maxMem, setMaxMem] = useState(16 * GB);

  useEffect(() => {
    let cancelled = false;
    api.getSystemResources().then((res) => {
      if (cancelled) return;
      setMaxCpu(Math.max(res.cpu_cores, MIN_CPU));
      setMaxMem(Math.max(res.memory_bytes, MIN_MEM));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pending changes — null means no change from saved value
  const [pendingResources, setPendingResources] = useState<{
    cpu: number;
    mem: number;
  } | null>(null);
  const [pendingNetworkMode, setPendingNetworkMode] =
    useState<NetworkMode | null>(null);
  const [pendingPortMappings, setPendingPortMappings] = useState<
    PortMapping[] | null
  >(null);
  const [pendingEnvVars, setPendingEnvVars] = useState<EnvVar[] | null>(null);

  // Determine if there are unsaved changes per section
  const hasResourceChanges =
    pendingResources !== null &&
    (pendingResources.cpu !== (bot.cpu_limit ?? maxCpu) ||
      pendingResources.mem !== (bot.memory_limit ?? maxMem));

  const hasNetworkChanges =
    pendingNetworkMode !== null &&
    JSON.stringify(pendingNetworkMode) !==
      JSON.stringify(bot.network_mode);

  const hasPortChanges =
    pendingPortMappings !== null &&
    JSON.stringify(pendingPortMappings) !==
      JSON.stringify(bot.port_mappings);

  const hasEnvChanges =
    pendingEnvVars !== null &&
    JSON.stringify(
      pendingEnvVars.filter((v) => v.key.trim())
    ) !== JSON.stringify(bot.env_vars ?? []);

  const hasChanges =
    hasResourceChanges ||
    hasNetworkChanges ||
    hasPortChanges ||
    hasEnvChanges;

  // Disable save if custom network name is empty
  const pendingModeIsCustomEmpty =
    pendingNetworkMode !== null &&
    typeof pendingNetworkMode === "object" &&
    "custom" in pendingNetworkMode &&
    !pendingNetworkMode.custom.trim();

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (hasResourceChanges && pendingResources) {
        await updateResourceLimits(
          bot.id,
          pendingResources.cpu,
          pendingResources.mem
        );
      }
      if (hasNetworkChanges && pendingNetworkMode) {
        await storeSetNetworkMode(bot.id, pendingNetworkMode);
      }
      if (hasPortChanges && pendingPortMappings) {
        await updatePortMappings(bot.id, pendingPortMappings);
      }
      if (hasEnvChanges && pendingEnvVars) {
        const filtered = pendingEnvVars.filter((v) => v.key.trim() !== "");
        await updateEnvVars(bot.id, filtered);
      }
      if (isRunning) {
        await restartBot(bot.id);
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const effectiveNetworkMode = pendingNetworkMode ?? bot.network_mode;

  return (
    <div className="overflow-y-auto p-4 space-y-6">
      {/* Top bar: restart warning + unified save button */}
      {(isRunning || hasChanges) && (
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="flex flex-1 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">
                Changes to Docker settings take effect after restarting the
                bot.
              </p>
            </div>
          )}
          {hasChanges && (
            <button
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || pendingModeIsCustomEmpty}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isRunning ? "Save & Restart" : "Save"}
            </button>
          )}
        </div>
      )}

      {saveError && (
        <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">
          {saveError}
        </p>
      )}

      {/* Resource Limits */}
      <ResourceLimitsEditor
        cpuLimit={bot.cpu_limit ?? null}
        memoryLimit={bot.memory_limit ?? null}
        maxCpu={maxCpu}
        maxMem={maxMem}
        onChange={(cpu, mem) => setPendingResources({ cpu, mem })}
      />

      {/* Network Mode */}
      <NetworkModePicker
        networkMode={bot.network_mode}
        onChange={setPendingNetworkMode}
      />

      {/* Port Mappings */}
      <PortMappingEditor
        portMappings={bot.port_mappings}
        networkMode={effectiveNetworkMode}
        onChange={setPendingPortMappings}
      />

      {/* Workspace Path */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">
          Workspace Path
        </h3>
        <p className="text-xs text-gray-400">
          A local folder mounted into the container at{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
            /workspace
          </code>
          . The bot can read and write files here.
        </p>
        <div className="flex items-center gap-2">
          {bot.workspace_path ? (
            <>
              <span className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600">
                {bot.workspace_path}
              </span>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                onClick={async () => {
                  const dir = await open({ directory: true });
                  if (dir) await setWorkspacePath(bot.id, dir);
                }}
              >
                <FolderOpen className="h-3 w-3" />
                Change
              </button>
              <button
                className="inline-flex shrink-0 items-center rounded-md border border-gray-200 bg-white p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => setWorkspacePath(bot.id, null)}
                title="Remove workspace"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              onClick={async () => {
                const dir = await open({ directory: true });
                if (dir) await setWorkspacePath(bot.id, dir);
              }}
            >
              <FolderOpen className="h-3 w-3" />
              Choose Folder
            </button>
          )}
        </div>
      </div>

      {/* Env Vars */}
      <EnvVarEditor
        envVars={bot.env_vars ?? EMPTY_ENV_VARS}
        onChange={setPendingEnvVars}
      />
    </div>
  );
}

// ── Terminal Tab ──────────────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: "openclaw configure", command: "openclaw configure" },
  { label: "openclaw status", command: "openclaw status" },
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
  const {
    containerRef,
    isConnected,
    isConnecting,
    connectionError,
    writeCommand,
    reconnect,
  } = useInteractiveTerminal({ botId, isRunning });

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
        {/* Connecting/reconnecting overlay */}
        {isConnecting && !connectionError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isConnected ? "Connecting..." : "Reconnecting..."}
            </div>
          </div>
        )}

        {/* Connection error bar */}
        {connectionError && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-red-950/90 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-red-300">
              Connection failed
            </span>
            <button
              className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-md bg-red-800 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-700"
              onClick={reconnect}
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect
            </button>
          </div>
        )}

        <div ref={containerRef} className="h-full w-full p-1" />
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
