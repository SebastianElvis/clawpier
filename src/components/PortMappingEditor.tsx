import { useState, useCallback } from "react";
import { Plus, Trash2, AlertTriangle, Zap, HelpCircle, Info } from "lucide-react";
import type { NetworkMode, PortMapping } from "../lib/types";
import { checkPortAvailable, suggestPort } from "../lib/tauri";

// ── Presets ─────────────────────────────────────────────────────────

const PORT_PRESETS = [
  { label: "Webhook", container_port: 80, host_port: 8080, protocol: "tcp" as const, description: "HTTP webhook receiver" },
  { label: "API", container_port: 3000, host_port: 3000, protocol: "tcp" as const, description: "REST/GraphQL API" },
  { label: "WebSocket", container_port: 8443, host_port: 8443, protocol: "tcp" as const, description: "Secure WebSocket" },
];

interface PortMappingEditorProps {
  portMappings: PortMapping[];
  networkMode: NetworkMode;
  onChange: (mappings: PortMapping[]) => void;
}

export function PortMappingEditor({
  portMappings,
  networkMode,
  onChange,
}: PortMappingEditorProps) {
  const [userMappings, setUserMappings] = useState<PortMapping[] | null>(null);
  const [portConflicts, setPortConflicts] = useState<Record<number, boolean>>({});
  const [showHelp, setShowHelp] = useState(false);

  const mappings = userMappings ?? portMappings;

  const modeKey = typeof networkMode === "string" ? networkMode : "custom";
  const disabled = modeKey === "none";

  const update = useCallback(
    (updated: PortMapping[]) => {
      setUserMappings(updated);
      onChange(updated);
    },
    [onChange]
  );

  const addMapping = () => {
    const updated = [
      ...mappings,
      { container_port: 3000, host_port: 3000, protocol: "tcp" as const },
    ];
    update(updated);
  };

  const addPreset = async (preset: (typeof PORT_PRESETS)[0]) => {
    // Check if this preset already exists
    const exists = mappings.some(
      (m) =>
        m.container_port === preset.container_port &&
        m.host_port === preset.host_port &&
        m.protocol === preset.protocol
    );
    if (exists) return;

    // Auto-suggest an available host port if the preset's port is taken
    let hostPort = preset.host_port;
    try {
      const check = await checkPortAvailable(hostPort);
      if (!check.available) {
        hostPort = await suggestPort(hostPort);
      }
    } catch {
      // Ignore — use default port
    }

    const updated = [
      ...mappings,
      {
        container_port: preset.container_port,
        host_port: hostPort,
        protocol: preset.protocol,
      },
    ];
    update(updated);
  };

  const removeMapping = (index: number) => {
    const removed = mappings[index];
    if (removed) {
      setPortConflicts((prev) => {
        const next = { ...prev };
        delete next[removed.host_port];
        return next;
      });
    }
    update(mappings.filter((_, i) => i !== index));
  };

  const updateMapping = (
    index: number,
    field: keyof PortMapping,
    value: string | number
  ) => {
    const updated = [...mappings];
    if (field === "protocol") {
      updated[index] = { ...updated[index], protocol: value as "tcp" | "udp" };
    } else {
      const num = typeof value === "string" ? parseInt(value) || 0 : value;
      updated[index] = { ...updated[index], [field]: num };
    }
    update(updated);
  };

  // Check port availability on blur
  const handleHostPortBlur = async (port: number) => {
    if (port < 1024 || port > 65535) return;
    try {
      const result = await checkPortAvailable(port);
      setPortConflicts((prev) => ({ ...prev, [port]: !result.available }));
    } catch {
      // Ignore check failures
    }
  };

  if (disabled) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          Port Mappings
        </h3>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <p className="font-medium">Network is disabled (sandbox mode)</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-400">
              Port mappings require bridge or host networking. Switch the network
              mode above to enable port forwarding.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          Port Mappings
        </h3>
        <button
          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          onClick={() => setShowHelp(!showHelp)}
          title="Port mapping help"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Contextual help */}
      {showHelp && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 text-xs text-blue-800 dark:text-blue-300">
            <p className="font-medium">When do you need port mappings?</p>
            <ul className="list-inside list-disc space-y-0.5 text-blue-700 dark:text-blue-400">
              <li>
                <strong>Webhooks</strong> — Telegram/Discord webhook channels
                need an HTTP endpoint reachable from the internet
              </li>
              <li>
                <strong>API access</strong> — To call OpenClaw&apos;s API from
                your host machine
              </li>
              <li>
                <strong>Development</strong> — To access services running inside
                the container
              </li>
            </ul>
            <p className="text-blue-600 dark:text-blue-500">
              All ports are bound to{" "}
              <code className="rounded bg-blue-100 px-1 dark:bg-blue-900">
                127.0.0.1
              </code>{" "}
              (localhost only).
            </p>
          </div>
        </div>
      )}

      {/* Quick presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          Presets:
        </span>
        {PORT_PRESETS.map((preset) => {
          const exists = mappings.some(
            (m) =>
              m.container_port === preset.container_port &&
              m.protocol === preset.protocol
          );
          return (
            <button
              key={preset.label}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                exists
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800/50 dark:bg-green-950/30 dark:text-green-400"
                  : "border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-blue-300 hover:text-blue-600"
              }`}
              onClick={() => !exists && addPreset(preset)}
              disabled={exists}
              title={preset.description}
            >
              <Zap className="h-2.5 w-2.5" />
              {preset.label}
              {preset.host_port !== preset.container_port
                ? ` (${preset.host_port}→${preset.container_port})`
                : ` (${preset.host_port})`}
            </button>
          );
        })}
      </div>

      {mappings.length > 0 && (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            <span>Container</span>
            <span>Host</span>
            <span>Protocol</span>
            <span />
          </div>
          {/* Rows */}
          {mappings.map((m, i) => (
            <div key={i}>
              <div className="grid grid-cols-[1fr_1fr_80px_32px] items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={m.container_port}
                  onChange={(e) =>
                    updateMapping(i, "container_port", e.target.value)
                  }
                  className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-blue-300"
                />
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={m.host_port}
                  onChange={(e) =>
                    updateMapping(i, "host_port", e.target.value)
                  }
                  onBlur={() => handleHostPortBlur(m.host_port)}
                  className={`w-full rounded-md border px-2 py-1 text-xs outline-none ${
                    portConflicts[m.host_port]
                      ? "border-red-400 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-950/30 dark:text-red-300"
                      : m.host_port < 1024 && m.host_port > 0
                        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                        : "border-[var(--border-primary)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:border-blue-300"
                  }`}
                />
                <select
                  value={m.protocol}
                  onChange={(e) =>
                    updateMapping(i, "protocol", e.target.value)
                  }
                  className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-input)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-blue-300"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
                <button
                  className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--badge-red-bg)] hover:text-[var(--badge-red-text)]"
                  onClick={() => removeMapping(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {/* Port conflict warning */}
              {portConflicts[m.host_port] && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Port {m.host_port} is already in use on your machine
                </p>
              )}
              {/* Privileged port warning */}
              {m.host_port > 0 && m.host_port < 1024 && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Privileged port — must be ≥ 1024
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-blue-300 hover:text-blue-600"
        onClick={addMapping}
      >
        <Plus className="h-3 w-3" />
        Add Port
      </button>
    </div>
  );
}
