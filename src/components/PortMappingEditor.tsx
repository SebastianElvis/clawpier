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
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Port Mappings
        </h3>
        <div className="flex items-start gap-2 rounded-lg border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--badge-amber-text)]" />
          <div className="text-xs text-[var(--badge-amber-text)]">
            <p className="font-medium">Network is disabled (sandbox mode)</p>
            <p className="mt-0.5 text-[var(--badge-amber-text)]">
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
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
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
        <div className="flex items-start gap-2 rounded-lg border border-[var(--focus-border)] bg-[var(--accent-subtle)] p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-text)]" />
          <div className="space-y-1 text-xs text-[var(--accent-text)]">
            <p className="font-medium">When do you need port mappings?</p>
            <ul className="list-inside list-disc space-y-0.5 text-[var(--accent-text)]">
              <li>
                <strong>Webhooks</strong> — Telegram/Discord webhook channels
                need an HTTP endpoint reachable from the internet
              </li>
              <li>
                <strong>API access</strong> — To call the bot&apos;s API from
                your host machine
              </li>
              <li>
                <strong>Development</strong> — To access services running inside
                the container
              </li>
            </ul>
            <p className="text-[var(--accent-text)]">
              All ports are bound to{" "}
              <code className="rounded bg-[var(--accent-subtle)] px-1">
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
                  ? "border-[var(--badge-green-text)]/30 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]"
                  : "border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--focus-border)] hover:text-[var(--accent-text)]"
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
                  className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--focus-border)]"
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
                      ? "border-[var(--badge-red-text)]/30 bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]"
                      : m.host_port < 1024 && m.host_port > 0
                        ? "border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]"
                        : "border-[var(--border-primary)] bg-[var(--bg-input)] text-[var(--text-primary)] focus:border-[var(--focus-border)]"
                  }`}
                />
                <select
                  value={m.protocol}
                  onChange={(e) =>
                    updateMapping(i, "protocol", e.target.value)
                  }
                  className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-input)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--focus-border)]"
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
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--badge-red-text)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Port {m.host_port} is already in use on your machine
                </p>
              )}
              {/* Privileged port warning */}
              {m.host_port > 0 && m.host_port < 1024 && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--badge-amber-text)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Privileged port — must be ≥ 1024
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--focus-border)] hover:text-[var(--accent-text)]"
        onClick={addMapping}
      >
        <Plus className="h-3 w-3" />
        Add Port
      </button>
    </div>
  );
}
