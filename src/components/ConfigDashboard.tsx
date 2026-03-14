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
  Send,
  Shield,
  Users,
  Zap,
  AtSign,
  Check,
  X,
} from "lucide-react";
import { getBotConfig, resolveTelegramBot } from "../lib/tauri";
import type { TelegramBotInfo } from "../lib/tauri";

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

  const models = merged.models as Record<string, unknown> | undefined;
  const agents = merged.agents as Record<string, unknown> | undefined;
  const channels = merged.channels as Record<string, unknown> | undefined;
  const gateway = merged.gateway as Record<string, unknown> | undefined;
  const skills = merged.skills as Record<string, unknown> | undefined;
  const webTools = merged.web_tools as Record<string, unknown> | undefined;
  const commands = merged.commands as Record<string, unknown> | undefined;
  const daemon = merged.daemon as Record<string, unknown> | undefined;
  const healthCheck = merged.health_check as Record<string, unknown> | undefined;
  const plugins = merged.plugins as Record<string, unknown> | undefined;

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
            configured={!!models}
            summary={summarizeModel(models, agents)}
          />
          <ChannelsCard botId={botId} channels={channels} />
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
          <InfoRow
            icon={Wrench}
            label="Plugins"
            value={plugins ? summarizePlugins(plugins) : null}
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

// ── Channels card with Telegram bot info ─────────────────────────────

function ChannelsCard({
  botId,
  channels,
}: {
  botId: string;
  channels: Record<string, unknown> | undefined;
}) {
  const [tgInfo, setTgInfo] = useState<TelegramBotInfo | null>(null);
  const [tgResolvedKey, setTgResolvedKey] = useState<string | null>(null);

  const hasTelegram =
    channels &&
    typeof channels.telegram === "object" &&
    channels.telegram !== null;
  const tgConfig = hasTelegram
    ? (channels.telegram as Record<string, unknown>)
    : null;
  const tgEnabled = tgConfig?.enabled !== false;

  const shouldFetchTg = !!(hasTelegram && tgEnabled);
  const fetchKey = `${botId}:${hasTelegram}:${tgEnabled}`;
  const tgLoading = shouldFetchTg && tgResolvedKey !== fetchKey;

  // Resolve Telegram bot info when bot/channel config changes
  useEffect(() => {
    if (!hasTelegram || !tgEnabled) return;
    let cancelled = false;
    const key = `${botId}:${hasTelegram}:${tgEnabled}`;
    resolveTelegramBot(botId)
      .then((info) => {
        if (!cancelled) {
          setTgInfo(info);
          setTgResolvedKey(key);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTgInfo(null);
          setTgResolvedKey(key);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [botId, hasTelegram, tgEnabled]);

  const channelCount = channels ? Object.keys(channels).length : 0;

  if (!channels || channelCount === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-700">
            Channels
          </span>
          <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-400">
            not set
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400 italic">
          Not configured
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-700">
          Channels
        </span>
        <span className="ml-auto rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
          {channelCount}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* ── Telegram channel ── */}
        {tgConfig && (
          <div className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
            {/* Header row: icon + name + enabled badge */}
            <div className="flex items-center gap-1.5">
              <Send className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] font-medium text-gray-700">
                Telegram
              </span>
              {tgEnabled ? (
                <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-700">
                  <Check className="h-2 w-2" /> on
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600">
                  <X className="h-2 w-2" /> off
                </span>
              )}
            </div>

            {/* Bot identity */}
            {tgLoading ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Resolving bot...
              </div>
            ) : tgInfo ? (
              <div className="mt-1 flex items-center gap-1.5">
                <AtSign className="h-2.5 w-2.5 text-gray-400" />
                <span className="font-mono text-[11px] text-blue-600">
                  @{tgInfo.username ?? "unknown"}
                </span>
                <span className="text-[10px] text-gray-400">
                  ({tgInfo.first_name})
                </span>
              </div>
            ) : null}

            {/* Policy chips */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {typeof tgConfig.dmPolicy === "string" && (
                <PolicyChip
                  icon={Shield}
                  label={`DM: ${tgConfig.dmPolicy}`}
                />
              )}
              {typeof tgConfig.groupPolicy === "string" && (
                <PolicyChip
                  icon={Users}
                  label={`Group: ${tgConfig.groupPolicy}`}
                />
              )}
              {typeof tgConfig.streaming === "string" && (
                <PolicyChip
                  icon={Zap}
                  label={`Stream: ${tgConfig.streaming}`}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Other channels ── */}
        {Object.entries(channels)
          .filter(([name]) => name !== "telegram")
          .map(([name, config]) => {
            const enabled =
              typeof config === "object" && config !== null
                ? (config as Record<string, unknown>).enabled !== false
                : true;
            return (
              <div
                key={name}
                className="flex items-center gap-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
              >
                <MessageSquare className="h-3 w-3 text-gray-400" />
                <span className="text-[11px] font-medium text-gray-700">
                  {name}
                </span>
                {enabled ? (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-700">
                    <Check className="h-2 w-2" /> on
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600">
                    <X className="h-2 w-2" /> off
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function PolicyChip({
  icon: Icon,
  label,
}: {
  icon: typeof Shield;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] text-gray-500 ring-1 ring-gray-200">
      <Icon className="h-2 w-2" />
      {label}
    </span>
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
  models: Record<string, unknown> | undefined,
  agents: Record<string, unknown> | undefined,
): string[] {
  if (!models) return [];
  const lines: string[] = [];

  // Build a lookup from "provider/id" → display name using models.providers
  const providers = models.providers as Record<string, unknown> | undefined;
  const aliasMap = new Map<string, string>();
  if (providers) {
    for (const [providerName, providerConfig] of Object.entries(providers)) {
      const cfg = providerConfig as Record<string, unknown>;
      const providerModels = cfg.models as Array<Record<string, unknown>> | undefined;
      if (providerModels) {
        for (const m of providerModels) {
          const id = m.id as string | undefined;
          const name = m.name as string | undefined;
          if (id && name) aliasMap.set(`${providerName}/${id}`, name);
        }
      }
    }
  }

  // Also check agents.defaults.models for aliases (e.g. { "kimi-coding/k2p5": { alias: "..." } })
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const defaultModels = defaults?.models as Record<string, unknown> | undefined;
  if (defaultModels) {
    for (const [key, val] of Object.entries(defaultModels)) {
      const cfg = val as Record<string, unknown>;
      if (cfg.alias && !aliasMap.has(key)) aliasMap.set(key, cfg.alias as string);
    }
  }

  // Extract primary model from agents.defaults.model.primary (e.g. "kimi-coding/k2p5")
  const defaultModel = defaults?.model as Record<string, unknown> | undefined;
  const primary = defaultModel?.primary as string | undefined;
  if (primary) {
    const displayName = aliasMap.get(primary);
    lines.push(displayName ? `Primary: ${primary} (${displayName})` : `Primary: ${primary}`);
  }

  // Show fallbacks if configured
  const fallbacks = defaultModel?.fallbacks as string[] | undefined;
  if (fallbacks && fallbacks.length > 0) {
    const names = fallbacks.map((f) => aliasMap.get(f) ?? f);
    lines.push(`Fallbacks: ${names.join(", ")}`);
  }

  // Fallback: show provider list only when no primary is set
  if (lines.length === 0) {
    if (models.mode) lines.push(`Mode: ${models.mode}`);
    for (const [k, v] of Object.entries(models)) {
      if (typeof v === "string" || typeof v === "number")
        lines.push(`${k}: ${v}`);
      if (lines.length >= 3) break;
    }
  }
  return lines;
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
  if (!defaults) return summarizeObject(agents);
  const parts: string[] = [];
  const model = defaults.model as Record<string, unknown> | undefined;
  if (model?.primary) parts.push(`model: ${model.primary}`);
  if (defaults.workspace) parts.push(`workspace: ${defaults.workspace}`);
  return parts.length > 0 ? parts.join(", ") : summarizeObject(agents);
}

function summarizePlugins(plugins: Record<string, unknown>): string | null {
  const entries = plugins.entries as Record<string, unknown> | undefined;
  if (!entries) return summarizeObject(plugins);
  const enabled = Object.entries(entries)
    .filter(([, cfg]) => {
      const c = cfg as Record<string, unknown>;
      return c.enabled !== false;
    })
    .map(([name]) => name);
  if (enabled.length === 0) return "none enabled";
  return enabled.join(", ");
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
