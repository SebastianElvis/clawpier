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
import type { AgentType } from "../lib/types";

interface ConfigDashboardProps {
  botId: string;
  isRunning: boolean;
  agentType?: AgentType;
  onSwitchToTerminal: () => void;
  onRestart?: () => void;
}

export function ConfigDashboard({
  botId,
  isRunning,
  agentType,
  onSwitchToTerminal,
  onRestart,
}: ConfigDashboardProps) {
  const configureCmd = agentType === "Hermes" ? "hermes setup" : "openclaw configure";
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
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--badge-red-text)]">
        <p>Failed to load config: {error}</p>
        <button
          className="rounded-md bg-[var(--bg-hover)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-active)]"
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
        <FileText className="h-10 w-10 text-[var(--text-tertiary)]" />
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            No configuration found
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {isRunning ? "Run " : "Start the bot and run "}
            <code className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[11px]">
              {configureCmd}
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
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-2">
          <div className="flex items-center gap-2">
            <Code className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Raw Configuration
            </span>
          </div>
          <button
            className="rounded-md bg-[var(--bg-hover)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-active)]"
            onClick={() => setShowRaw(false)}
          >
            Back
          </button>
        </div>
        <pre className="flex-1 overflow-auto bg-[var(--bg-primary)] p-4 font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
          {rawContent}
        </pre>
      </div>
    );
  }

  const isHermes = agentType === "Hermes";

  return (
    <div className="flex h-full flex-col">
      {/* Pinned header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-4 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-[var(--badge-amber-text)]">
          <Terminal className="h-3 w-3" />
          <span>
            Run{" "}
            <code className="rounded bg-[var(--bg-hover)] px-1 py-0.5 font-mono font-medium">
              {configureCmd}
            </code>{" "}
            in{" "}
            <button
              className="font-medium underline hover:opacity-80"
              onClick={onSwitchToTerminal}
            >
              Terminal
            </button>{" "}
            to modify
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && onRestart && (
            <button
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-700"
              onClick={() => { onRestart(); setTimeout(fetchConfig, 2000); }}
              title="Restart bot to apply configuration changes"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Restart to apply
            </button>
          )}
          <button
            className="text-[11px] text-[var(--badge-amber-text)] hover:opacity-80"
            onClick={() => setShowRaw(true)}
          >
            Raw
          </button>
          <button
            className="inline-flex items-center rounded-md bg-[var(--badge-amber-bg)] p-1 text-[var(--badge-amber-text)] hover:opacity-80"
            onClick={fetchConfig}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isHermes ? (
          <HermesConfigContent merged={merged} botId={botId} />
        ) : (
          <OpenClawConfigContent merged={merged} botId={botId} showMore={showMore} setShowMore={setShowMore} />
        )}
      </div>
    </div>
  );
}

// ── Hermes config content ─────────────────────────────────────────────

function HermesConfigContent({ merged, botId }: { merged: Record<string, unknown>; botId: string }) {
  const model = merged.model as Record<string, unknown> | undefined;
  const platforms = merged.platforms as Record<string, unknown> | undefined;
  const terminal = merged.terminal as Record<string, unknown> | undefined;
  const sessionReset = merged.session_reset as Record<string, unknown> | undefined;
  const streaming = merged.streaming as Record<string, unknown> | undefined;
  const skills = merged.skills as Record<string, unknown> | undefined;
  const agent = merged.agent as Record<string, unknown> | undefined;
  const compression = merged.compression as Record<string, unknown> | undefined;

  const modelName = model?.default as string | undefined;
  const provider = model?.provider as string | undefined;

  // Extract platform channels from Hermes' platforms config
  const hermesChannels = platforms ? Object.entries(platforms).reduce<Record<string, unknown>>((acc, [name, cfg]) => {
    if (typeof cfg === "object" && cfg !== null) {
      acc[name] = cfg;
    }
    return acc;
  }, {}) : undefined;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <HeroCard
          icon={Brain}
          label="Model"
          configured={!!(modelName || provider)}
          summary={[
            ...(modelName ? [`Model: ${modelName}`] : []),
            ...(provider ? [`Provider: ${provider}`] : []),
          ]}
        />
        <ChannelsCard botId={botId} channels={hermesChannels} />
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] divide-y divide-[var(--border-secondary)]">
        <InfoRow icon={Terminal} label="Terminal" value={terminal ? (terminal.backend as string ?? summarizeObject(terminal)) : null} />
        <InfoRow icon={Radio} label="Streaming" value={streaming ? summarizeObject(streaming) : null} />
        <InfoRow icon={Wrench} label="Skills" value={skills ? summarizeObject(skills) : null} />
        <InfoRow icon={Cog} label="Agent" value={agent ? summarizeObject(agent) : null} />
        <InfoRow icon={Server} label="Compression" value={compression ? summarizeObject(compression) : null} />
        <InfoRow icon={RefreshCw} label="Session Reset" value={sessionReset ? summarizeObject(sessionReset) : null} />
      </div>
    </>
  );
}

// ── OpenClaw config content ──────────────────────────────────────────

function OpenClawConfigContent({
  merged,
  botId,
  showMore,
  setShowMore,
}: {
  merged: Record<string, unknown>;
  botId: string;
  showMore: boolean;
  setShowMore: (v: boolean) => void;
}) {
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
    <>
      <div className="grid grid-cols-2 gap-2">
        <HeroCard
          icon={Brain}
          label="Model"
          configured={!!models}
          summary={summarizeModel(models, agents)}
        />
        <ChannelsCard botId={botId} channels={channels} />
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] divide-y divide-[var(--border-secondary)]">
        <InfoRow icon={Radio} label="Gateway" value={summarizeGateway(gateway)} />
        <InfoRow icon={Globe} label="Web Tools" value={webTools ? summarizeObject(webTools) : null} />
        <InfoRow icon={Wrench} label="Skills" value={skills ? summarizeObject(skills) : null} />
        <InfoRow icon={FileText} label="Agents" value={agents ? summarizeAgents(agents) : null} />
        <InfoRow icon={Wrench} label="Plugins" value={plugins ? summarizePlugins(plugins) : null} />

        {showMore && (
          <>
            <InfoRow icon={Cog} label="Commands" value={commands ? summarizeObject(commands) : null} />
            <InfoRow icon={Server} label="Daemon" value={daemon ? summarizeObject(daemon) : null} />
            <InfoRow icon={HeartPulse} label="Health Check" value={healthCheck ? summarizeObject(healthCheck) : null} />
          </>
        )}
      </div>

      <button
        className="mt-1 flex w-full items-center justify-center gap-1 py-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        onClick={() => setShowMore(!showMore)}
      >
        {showMore ? "Show less" : "Show more"}
        <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`} />
      </button>
    </>
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
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {label}
        </span>
        {!configured && (
          <span className="ml-auto rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">
            not set
          </span>
        )}
      </div>
      {configured && summary.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {summary.map((line, i) => (
            <p key={i} className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
              {line}
            </p>
          ))}
        </div>
      ) : !configured ? (
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)] italic">
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
      <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] p-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Channels
          </span>
          <span className="ml-auto rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">
            not set
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)] italic">
          Not configured
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          Channels
        </span>
        <span className="ml-auto rounded bg-[var(--badge-blue-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--badge-blue-text)]">
          {channelCount}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {/* ── Telegram channel ── */}
        {tgConfig && (
          <div className="rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2 py-1.5">
            {/* Header row: icon + name + enabled badge */}
            <div className="flex items-center gap-1.5">
              <Send className="h-3 w-3 text-blue-500" />
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                Telegram
              </span>
              {tgEnabled ? (
                <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-[var(--badge-green-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--badge-green-text)]">
                  <Check className="h-2 w-2" /> on
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-[var(--badge-red-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--badge-red-text)]">
                  <X className="h-2 w-2" /> off
                </span>
              )}
            </div>

            {/* Bot identity */}
            {tgLoading ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Resolving bot...
              </div>
            ) : tgInfo ? (
              <div className="mt-1 flex items-center gap-1.5">
                <AtSign className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                <span className="font-mono text-[11px] text-blue-600">
                  @{tgInfo.username ?? "unknown"}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
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
                className="flex items-center gap-1.5 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-primary)] px-2 py-1.5"
              >
                <MessageSquare className="h-3 w-3 text-[var(--text-tertiary)]" />
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {name}
                </span>
                {enabled ? (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-[var(--badge-green-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--badge-green-text)]">
                    <Check className="h-2 w-2" /> on
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-[var(--badge-red-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--badge-red-text)]">
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
    <span className="inline-flex items-center gap-0.5 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)] ring-1 ring-[var(--border-primary)]">
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
      <Icon className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
      <span className="w-20 shrink-0 text-[11px] text-[var(--text-secondary)]">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">
        {value ?? (
          <span className="font-sans text-[var(--text-tertiary)] italic">not configured</span>
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
