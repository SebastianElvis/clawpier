import { useState, useEffect } from "react";
import {
  X,
  FolderOpen,
  Loader2,
  Feather,
  Gauge,
  Zap,
  Shield,
  Wifi,
  Globe,
  Network,
  AlertTriangle,
  Cpu,
  HardDrive,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { NetworkMode } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { FocusTrap } from "./FocusTrap";
import * as api from "../lib/tauri";

interface NewBotSheetProps {
  onClose: () => void;
}

type SimpleMode = "none" | "bridge" | "host" | "custom";

const MB = 1024 * 1024;
const GB = 1024 * MB;

const MIN_CPU = 2;
const MIN_MEM = 4 * GB;

const RESOURCE_PRESETS = [
  {
    key: "lightweight",
    label: "Lightweight",
    icon: Feather,
    cpu: 2,
    memory: 4 * GB,
  },
  {
    key: "standard",
    label: "Standard",
    icon: Gauge,
    cpu: 4,
    memory: 8 * GB,
  },
  {
    key: "performance",
    label: "Performance",
    icon: Zap,
    cpu: 8,
    memory: 16 * GB,
  },
] as const;

const NETWORK_MODES: {
  key: SimpleMode;
  label: string;
  icon: typeof Shield;
}[] = [
  { key: "bridge", label: "Bridge", icon: Wifi },
  { key: "none", label: "Sandboxed", icon: Shield },
  { key: "host", label: "Host", icon: Globe },
  { key: "custom", label: "Custom", icon: Network },
];

function formatMemory(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

export function NewBotSheet({ onClose }: NewBotSheetProps) {
  const { createBot, bots } = useBotStore();
  const [name, setName] = useState("");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // System resources
  const [maxCpu, setMaxCpu] = useState(8);
  const [maxMem, setMaxMem] = useState(16 * GB);

  // Resource limits — default to lightweight preset
  const [selectedPreset, setSelectedPreset] = useState("lightweight");
  const [cpuLimit, setCpuLimit] = useState(MIN_CPU);
  const [memoryLimit, setMemoryLimit] = useState(MIN_MEM);

  // Network mode
  const [networkMode, setNetworkMode] = useState<SimpleMode>("bridge");
  const [customNetworkName, setCustomNetworkName] = useState("");

  // Fetch system resources on mount
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

  const isDuplicate = bots.some(
    (b) => b.name.toLowerCase() === name.trim().toLowerCase()
  );

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setWorkspacePath(selected as string);
    }
  };

  const applyPreset = (preset: (typeof RESOURCE_PRESETS)[number]) => {
    setSelectedPreset(preset.key);
    setCpuLimit(Math.min(Math.max(preset.cpu, MIN_CPU), maxCpu));
    setMemoryLimit(Math.min(Math.max(preset.memory, MIN_MEM), maxMem));
  };

  const handleCpuSlider = (value: number) => {
    setCpuLimit(value);
    setSelectedPreset("custom");
  };

  const handleMemorySlider = (valueMB: number) => {
    setMemoryLimit(valueMB * MB);
    setSelectedPreset("custom");
  };

  // Convert maxMem to MB for slider
  const maxMemMB = Math.round(maxMem / MB);
  const minMemMB = Math.round(MIN_MEM / MB);

  const buildNetworkMode = (): NetworkMode | undefined => {
    if (networkMode === "bridge") return undefined; // use default (Bridge)
    if (networkMode === "custom" && customNetworkName.trim()) {
      return { custom: customNetworkName.trim() };
    }
    if (networkMode === "custom") return undefined; // empty custom = use default
    return networkMode; // "none" | "host"
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isDuplicate) return;

    setCreating(true);
    setError(null);
    try {
      const resolvedNetworkMode = buildNetworkMode();
      await createBot(trimmed, workspacePath ?? undefined, {
        cpuLimit,
        memoryLimit,
        networkMode: resolvedNetworkMode,
      });
      onClose();
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <FocusTrap>
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
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-6">
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
              Mounted read-write at /workspace. Can be changed later in Settings.
            </p>
          </div>

          {/* Resource Limits */}
          <div className="mt-5">
            <label className="block text-xs font-medium text-gray-700">
              Resource limits
            </label>

            {/* Presets */}
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {RESOURCE_PRESETS.map((preset) => {
                const isActive = selectedPreset === preset.key;
                // Hide presets that exceed system resources
                if (preset.cpu > maxCpu || preset.memory > maxMem) return null;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                      isActive
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => applyPreset(preset)}
                  >
                    <preset.icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CPU slider */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Cpu className="h-3 w-3" />
                  CPU
                </span>
                <span className="text-xs font-medium text-gray-700">
                  {`${cpuLimit} core${cpuLimit !== 1 ? "s" : ""}`}
                </span>
              </div>
              <input
                type="range"
                min={MIN_CPU}
                max={maxCpu}
                step={1}
                value={cpuLimit}
                onChange={(e) => handleCpuSlider(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{MIN_CPU} cores</span>
                <span>{maxCpu} cores</span>
              </div>
            </div>

            {/* Memory slider */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-600">
                  <HardDrive className="h-3 w-3" />
                  Memory
                </span>
                <span className="text-xs font-medium text-gray-700">
                  {formatMemory(memoryLimit)}
                </span>
              </div>
              <input
                type="range"
                min={minMemMB}
                max={maxMemMB}
                step={512}
                value={memoryLimit / MB}
                onChange={(e) =>
                  handleMemorySlider(parseInt(e.target.value))
                }
                className="w-full accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{formatMemory(MIN_MEM)}</span>
                <span>{formatMemory(maxMem)}</span>
              </div>
            </div>

            <p className="mt-1 text-xs text-gray-400">
              Can be changed later in Settings.
            </p>
          </div>

          {/* Network Mode */}
          <div className="mt-5">
            <label className="block text-xs font-medium text-gray-700">
              Network mode
            </label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {NETWORK_MODES.map((mode) => {
                const isActive = networkMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                      isActive
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => setNetworkMode(mode.key)}
                  >
                    <mode.icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">
                      {mode.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Host warning */}
            {networkMode === "host" && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                <p className="text-[11px] text-amber-700">
                  Full access to host network. Only use if you trust this bot.
                </p>
              </div>
            )}

            {/* Custom network name */}
            {networkMode === "custom" && (
              <input
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-blue-300"
                placeholder="Docker network name"
                value={customNetworkName}
                onChange={(e) => setCustomNetworkName(e.target.value)}
              />
            )}

            <p className="mt-1 text-xs text-gray-400">
              {networkMode === "none" && "No network access (most secure). "}
              {networkMode === "bridge" && "Default Docker bridge networking. "}
              Can be changed later in Settings.
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
              disabled={
                !name.trim() ||
                isDuplicate ||
                creating ||
                (networkMode === "custom" && !customNetworkName.trim())
              }
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Bot
            </button>
          </div>
        </form>
      </div>
      </FocusTrap>
    </div>
  );
}
