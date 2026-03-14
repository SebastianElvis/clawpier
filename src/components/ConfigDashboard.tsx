import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  FileText,
  Code,
  Terminal,
  Loader2,
  Brain,
  Globe,
  Radio,
  MessageSquare,
  Wrench,
  Server,
  HeartPulse,
  Cog,
  ChevronDown,
} from "lucide-react";
import { getBotConfig } from "../lib/tauri";

interface ConfigDashboardProps {
  botId: string;
  isRunning: boolean;
  onSwitchToTerminal: () => void;
}

export function ConfigDashboard({
  botId,
  isRunning,
  onSwitchToTerminal,
}: ConfigDashboardProps) {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBotConfig(botId);
      setConfigs(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-red-500">
        <p>Failed to load config: {error}</p>
        <button
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200"
          onClick={fetchConfig}
        >
          Retry
        </button>
      </div>
    );
  }

  const merged = mergeConfigs(configs);
  const hasAnyConfig = Object.keys(merged).length > 0;

  if (!hasAnyConfig) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <FileText className="h-10 w-10 text-gray-300" />
        <div>
          <p className="text-sm font-medium text-gray-600">
            No configuration found
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {isRunning ? "Run " : "Start the bot and run "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px]">
              openclaw configure
            </code>
            {" in the Terminal tab to set up this agent."}
          </p>
        </div>
        <button
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          onClick={onSwitchToTerminal}
        >
          <Terminal className="h-3.5 w-3.5" />
          Open Terminal
        </button>
      </div>
    );
  }

  if (showRaw) {
    const rawContent = Object.entries(configs)
      .filter(([name]) => name.endsWith(".json") && !name.endsWith(".bak"))
      .map(([name, content]) => {
        try {
          return `// ${name}\n${JSON.stringify(JSON.parse(content), null, 2)}`;
        } catch {
          return `// ${name}\n${content}`;
        }
      })
      .join("\n\n");
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <Code className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">
              Raw Configuration
            </span>
          </div>
          <button
            className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            onClick={() => setShowRaw(false)}
          >
            Back
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-gray-50 p-4 font-mono text-xs text-gray-700 whitespace-pre-wrap">
          {rawContent}
        </pre>
      </div>
    );
  }

  const model = merged.model as Record<string, unknown> | undefined;
  const channels = merged.channels as Record<string, unknown> | undefined;
  const gateway = merged.gateway as Record<string, unknown> | undefined;
  const skills = merged.skills as Record<string, unknown> | undefined;
  const webTools = merged.web_tools as Record<string, unknown> | undefined;
  const agents = merged.agents as Record<string, unknown> | undefined;
  const commands = merged.commands as Record<string, unknown> | undefined;
  const daemon = merged.daemon as Record<string, unknown> | undefined;
  const healthCheck = merged.health_check as Record<string, unknown> | undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Pinned header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-amber-50 px-4 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-amber-700">
          <Terminal className="h-3 w-3" />
          <span>
            Run{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-medium">
              openclaw configure
            </code>{" "}
            in{" "}
            <button
              className="font-medium underline hover:text-amber-900"
              onClick={onSwitchToTerminal}
            >
              Terminal
            </button>{" "}
            to modify
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-[11px] text-amber-700 hover:text-amber-900"
            onClick={() => setShowRaw(true)}
          >
            Raw
          </button>
          <button
            className="inline-flex items-center rounded-md bg-amber-100 p-1 text-amber-700 hover:bg-amber-200"
            onClick={fetchConfig}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* ── Primary: Model & Channels ── */}
        <div className="grid grid-cols-2 gap-2">
          <HeroCard
            icon={Brain}
            label="Model"
            configured={!!model}
            summary={summarizeModel(model)}
          />
          <HeroCard
            icon={MessageSquare}
            label="Channels"
            configured={!!channels}
            summary={summarizeChannels(channels)}
          />
        </div>

        {/* ── Secondary: inline rows ── */}
        <div className="mt-3 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          <InfoRow
            icon={Radio}
            label="Gateway"
            value={summarizeGateway(gateway)}
          />
          <InfoRow
            icon={Globe}
            label="Web Tools"
            value={webTools ? summarizeObject(webTools) : null}
          />
          <InfoRow
            icon={Wrench}
            label="Skills"
            value={skills ? summarizeObject(skills) : null}
          />
          <InfoRow
            icon={FileText}
            label="Agents"
            value={agents ? summarizeAgents(agents) : null}
          />

          {/* Collapsible extras */}
          {showMore && (
            <>
              <InfoRow
                icon={Cog}
                label="Commands"
                value={commands ? summarizeObject(commands) : null}
              />
              <InfoRow
                icon={Server}
                label="Daemon"
                value={daemon ? summarizeObject(daemon) : null}
              />
              <InfoRow
                icon={HeartPulse}
                label="Health Check"
                value={healthCheck ? summarizeObject(healthCheck) : null}
              />
            </>
          )}
        </div>

        <button
          className="mt-1 flex w-full items-center justify-center gap-1 py-1 text-[11px] text-gray-400 hover:text-gray-600"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? "Show less" : "Show more"}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Hero card (Model / Channels) ─────────────────────────────────────

function HeroCard({
  icon: Icon,
  label,
  configured,
  summary,
}: {
  icon: typeof Brain;
  label: string;
  configured: boolean;
  summary: string[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-700">
          {label}
        </span>
        {!configured && (
          <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-400">
            not set
          </span>
        )}
      </div>
      {configured && summary.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {summary.map((line, i) => (
            <p key={i} className="truncate font-mono text-[11px] text-gray-600">
              {line}
            </p>
          ))}
        </div>
      ) : !configured ? (
        <p className="mt-1.5 text-[11px] text-gray-400 italic">
          Not configured
        </p>
      ) : null}
    </div>
  );
}

// ── Compact info row ─────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Radio;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Icon className="h-3 w-3 shrink-0 text-gray-400" />
      <span className="w-20 shrink-0 text-[11px] text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-700">
        {value ?? (
          <span className="font-sans text-gray-400 italic">not configured</span>
        )}
      </span>
    </div>
  );
}

// ── Summarizers ──────────────────────────────────────────────────────

function summarizeModel(
  model: Record<string, unknown> | undefined
): string[] {
  if (!model) return [];
  const lines: string[] = [];
  if (model.provider) lines.push(`Provider: ${model.provider}`);
  if (model.name || model.model)
    lines.push(`Model: ${model.name ?? model.model}`);
  if (model.endpoint) lines.push(`Endpoint: ${model.endpoint}`);
  // Fallback: show all keys if nothing matched
  if (lines.length === 0) {
    for (const [k, v] of Object.entries(model)) {
      if (typeof v === "string" || typeof v === "number")
        lines.push(`${k}: ${v}`);
      if (lines.length >= 3) break;
    }
  }
  return lines;
}

function summarizeChannels(
  channels: Record<string, unknown> | undefined
): string[] {
  if (!channels) return [];
  const lines: string[] = [];
  for (const [name, config] of Object.entries(channels)) {
    const enabled =
      typeof config === "object" && config !== null
        ? (config as Record<string, unknown>).enabled !== false
        : true;
    lines.push(`${name}${enabled ? "" : " (disabled)"}`);
  }
  return lines.length > 0 ? lines : ["None"];
}

function summarizeGateway(
  gateway: Record<string, unknown> | undefined
): string | null {
  if (!gateway) return null;
  const mode = gateway.mode ?? "unknown";
  const auth = gateway.auth as Record<string, unknown> | undefined;
  const authMode = auth?.mode ?? "";
  return `${mode}${authMode ? ` / ${authMode} auth` : ""}`;
}

function summarizeAgents(agents: Record<string, unknown>): string | null {
  const defaults = agents.defaults as Record<string, unknown> | undefined;
  if (defaults?.workspace) return `workspace: ${defaults.workspace}`;
  return summarizeObject(agents);
}

function summarizeObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      parts.push(`${k}: ${v}`);
    else if (typeof v === "object" && v !== null)
      parts.push(`${k}: {…}`);
    if (parts.length >= 3) break;
  }
  return parts.join(", ") || "configured";
}

// ── Helpers ──────────────────────────────────────────────────────────

function mergeConfigs(
  configs: Record<string, string>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [name, content] of Object.entries(configs)) {
    if (name.endsWith(".bak")) continue;
    try {
      const json = JSON.parse(content);
      if (typeof json === "object" && json !== null && !Array.isArray(json)) {
        Object.assign(merged, json);
      }
    } catch {
      // skip
    }
  }
  return merged;
}
