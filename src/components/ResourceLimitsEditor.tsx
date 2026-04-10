import { useState } from "react";
import { Cpu, HardDrive, Zap, Feather, Gauge } from "lucide-react";

interface ResourceLimitsEditorProps {
  cpuLimit: number | null | undefined;
  memoryLimit: number | null | undefined;
  maxCpu: number;
  maxMem: number;
  onChange: (cpu: number, mem: number) => void;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;
const MIN_CPU = 2;
const MIN_MEM = 4 * GB;

const PRESETS = [
  { label: "Lightweight", icon: Feather, cpu: 1, memory: 2 * GB },
  { label: "Standard", icon: Gauge, cpu: 4, memory: 8 * GB },
  { label: "Performance", icon: Zap, cpu: 8, memory: 16 * GB },
] as const;

function formatMemory(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.round(bytes / MB)} MB`;
}

export function ResourceLimitsEditor({
  cpuLimit,
  memoryLimit,
  maxCpu,
  maxMem,
  onChange,
}: ResourceLimitsEditorProps) {
  // User overrides — null means "show prop default"
  const [userCpu, setUserCpu] = useState<number | null>(null);
  const [userMem, setUserMem] = useState<number | null>(null);

  // Effective values: user override → prop → system max
  const cpu = userCpu ?? cpuLimit ?? maxCpu;
  const mem = userMem ?? memoryLimit ?? maxMem;

  const handleCpuChange = (newCpu: number) => {
    setUserCpu(newCpu);
    onChange(newCpu, mem);
  };

  const handleMemChange = (newMem: number) => {
    setUserMem(newMem);
    onChange(cpu, newMem);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const newCpu = Math.min(Math.max(preset.cpu, MIN_CPU), maxCpu);
    const newMem = Math.min(Math.max(preset.memory, MIN_MEM), maxMem);
    setUserCpu(newCpu);
    setUserMem(newMem);
    onChange(newCpu, newMem);
  };

  const maxMemMB = Math.round(maxMem / MB);
  const minMemMB = Math.round(MIN_MEM / MB);

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Resource Limits</h3>
      <p className="text-xs text-[var(--text-tertiary)]">
        Constrain CPU and memory usage for this bot.
      </p>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          // Hide presets that exceed system resources
          if (preset.cpu > maxCpu || preset.memory > maxMem) return null;
          const isActive =
            cpu === preset.cpu && mem === preset.memory;
          return (
            <button
              key={preset.label}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-[var(--focus-border)] bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]"
                  : "border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
              onClick={() => applyPreset(preset)}
            >
              <preset.icon className="h-3 w-3" />
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* CPU slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Cpu className="h-3 w-3" />
            CPU Cores
          </label>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {`${cpu} core${cpu !== 1 ? "s" : ""}`}
          </span>
        </div>
        <input
          type="range"
          min={MIN_CPU}
          max={maxCpu}
          step={1}
          value={cpu}
          onChange={(e) => handleCpuChange(parseFloat(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
          <span>{MIN_CPU} cores</span>
          <span>{maxCpu} cores</span>
        </div>
      </div>

      {/* Memory slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <HardDrive className="h-3 w-3" />
            Memory
          </label>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {formatMemory(mem)}
          </span>
        </div>
        <input
          type="range"
          min={minMemMB}
          max={maxMemMB}
          step={512}
          value={mem / MB}
          onChange={(e) => handleMemChange(parseInt(e.target.value) * MB)}
          className="w-full accent-[var(--btn-start-bg)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)]">
          <span>{formatMemory(MIN_MEM)}</span>
          <span>{formatMemory(maxMem)}</span>
        </div>
      </div>
    </div>
  );
}
