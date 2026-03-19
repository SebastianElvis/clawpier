import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Package,
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  LayoutGrid,
  List,
  ExternalLink,
  Globe,
  X,
  Star,
  DownloadCloud,
  User,
  Tag,
  Info,
} from "lucide-react";
import { useSkillBrowser } from "../hooks/use-skill-browser";
import { open } from "@tauri-apps/plugin-shell";
import * as api from "../lib/tauri";

type ViewMode = "list" | "grid";

interface SkillBrowserProps {
  botId: string;
}

export function SkillBrowser({ botId }: SkillBrowserProps) {
  const {
    skills,
    allSkills,
    loading,
    error,
    query,
    setQuery,
    filter,
    setFilter,
    clawhubAvailable,
    installingClawhub,
    installing,
    installSkill,
    uninstallSkill,
    installClawhub,
    isRegistrySearch,
    refresh,
  } = useSkillBrowser(botId);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("clawpier-skill-view");
    return saved === "grid" ? "grid" : "list";
  });

  const [selectedSkill, setSelectedSkill] = useState<import("../lib/types").Skill | null>(null);

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("clawpier-skill-view", mode);
  };

  const installedCount = allSkills.filter((s) => s.installed).length;
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Search & filter toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ClawHub registry..."
            className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          />
        </div>
        <div className="flex items-center gap-1">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="All" />
          <FilterButton
            active={filter === "installed"}
            onClick={() => setFilter("installed")}
            label={`Installed${installedCount > 0 ? ` (${installedCount})` : ""}`}
          />
        </div>

        <div className="flex items-center rounded-md border border-[var(--border-primary)]">
          <button
            onClick={() => toggleView("list")}
            className={`rounded-l-md p-1 ${viewMode === "list" ? "bg-[var(--bg-selected)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleView("grid")}
            className={`rounded-r-md p-1 ${viewMode === "grid" ? "bg-[var(--bg-selected)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Source indicator */}
      {!loading && skills.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-1">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {isSearching && isRegistrySearch ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-2.5 w-2.5" />
                ClawHub results for &ldquo;{query}&rdquo;
              </span>
            ) : isSearching ? (
              `Bundled skills matching "${query}"`
            ) : (
              `${allSkills.length} bundled skills (${installedCount} ready)`
            )}
          </span>
          {isSearching && isRegistrySearch && (
            <button
              onClick={() => open(`https://clawhub.com/search?q=${encodeURIComponent(query)}`)}
              className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600"
            >
              View on clawhub.com
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* ClawHub unavailable banner */}
      {clawhubAvailable === false && isSearching && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              ClawHub CLI not installed
            </p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400">
              Install it to search and install skills from the ClawHub registry.
            </p>
          </div>
          <button
            onClick={installClawhub}
            disabled={installingClawhub}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {installingClawhub ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {installingClawhub ? "Installing..." : "Install ClawHub"}
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && skills.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
            <Package className="h-8 w-8" />
            <p className="text-sm">
              {filter === "installed" ? "No skills installed yet" : query ? "No skills found" : "Loading skills..."}
            </p>
          </div>
        ) : viewMode === "list" ? (
          <div className="divide-y divide-[var(--border-primary)]">
            {skills.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                isInstalling={installing.has(skill.name)}
                onInstall={() => installSkill(skill.name)}
                onUninstall={() => uninstallSkill(skill.name)}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 p-3 grid-cols-2 lg:grid-cols-4">
            {skills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                isInstalling={installing.has(skill.name)}
                onInstall={() => installSkill(skill.name)}
                onUninstall={() => uninstallSkill(skill.name)}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedSkill && (
        <SkillDetailModal
          botId={botId}
          skill={selectedSkill}
          isInstalling={installing.has(selectedSkill.name)}
          onInstall={() => installSkill(selectedSkill.name)}
          onUninstall={() => uninstallSkill(selectedSkill.name)}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </div>
  );
}

// ── Filter button ───────────────────────────────────────────────────

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--bg-selected)] text-[var(--text-primary)]"
          : "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}

// ── Source badge ─────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "clawhub") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <Globe className="h-2 w-2" />
        ClawHub
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      <Package className="h-2 w-2" />
      Bundled
    </span>
  );
}

// ── Shared types ────────────────────────────────────────────────────

interface SkillActionProps {
  skill: import("../lib/types").Skill;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onClick: () => void;
}

// ── List view row ───────────────────────────────────────────────────

function SkillRow({ skill, isInstalling, onInstall, onUninstall, onClick }: SkillActionProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)]">
      <div className="shrink-0">
        {skill.installed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
        )}
      </div>

      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-[var(--text-primary)]">
            {skill.name}
          </span>
          <SourceBadge source={skill.source} />
          {skill.source === "clawhub" && (
            <button
              onClick={(e) => { e.stopPropagation(); open(`https://clawhub.com/skills/${skill.name}`); }}
              className="shrink-0 text-[var(--text-tertiary)] hover:text-blue-500"
              title="View on clawhub.com"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="truncate text-[11px] text-[var(--text-tertiary)]">
          {skill.description || "No description"}
        </p>
      </button>

      <ActionButton installed={skill.installed} isInstalling={isInstalling} onInstall={onInstall} onUninstall={onUninstall} source={skill.source} />
    </div>
  );
}

// ── Grid view card ──────────────────────────────────────────────────

function SkillCard({ skill, isInstalling, onInstall, onUninstall, onClick }: SkillActionProps) {
  return (
    <div
      className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 transition-shadow hover:shadow-md ${
        skill.installed
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-[var(--border-primary)] bg-[var(--bg-surface)]"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {skill.installed ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span className="truncate text-xs font-medium text-[var(--text-primary)]">
          {skill.name}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <SourceBadge source={skill.source} />
        {skill.source === "clawhub" && (
          <button
            onClick={(e) => { e.stopPropagation(); open(`https://clawhub.com/skills/${skill.name}`); }}
            className="text-[var(--text-tertiary)] hover:text-blue-500"
            title="View on clawhub.com"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-[var(--text-tertiary)]">
        {skill.description || "No description"}
      </p>
      <div className="mt-auto pt-0.5" onClick={(e) => e.stopPropagation()}>
        <ActionButton installed={skill.installed} isInstalling={isInstalling} onInstall={onInstall} onUninstall={onUninstall} full source={skill.source} />
      </div>
    </div>
  );
}

// ── Shared action button ────────────────────────────────────────────

function ActionButton({
  installed, isInstalling, onInstall, onUninstall, full, source,
}: {
  installed: boolean; isInstalling: boolean; onInstall: () => void; onUninstall: () => void; full?: boolean; source?: string;
}) {
  const width = full ? "w-full justify-center" : "";

  // Bundled + ready → "Ready" label, no action
  if (installed && source === "bundled") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 ${width}`}>
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    );
  }

  // Bundled + not ready → "Missing deps" label, no install button
  if (!installed && source === "bundled") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400 ${width}`} title="Required CLI tools are not installed in the container">
        <AlertTriangle className="h-3 w-3" /> Missing deps
      </span>
    );
  }

  // ClawHub + installed → uninstall button
  if (installed) {
    return (
      <button
        onClick={onUninstall}
        disabled={isInstalling}
        className={`inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400 ${width}`}
      >
        {isInstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        {isInstalling ? "Removing" : "Uninstall"}
      </button>
    );
  }

  // ClawHub + not installed → install button
  return (
    <button
      onClick={onInstall}
      disabled={isInstalling}
      className={`inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 ${width}`}
    >
      {isInstalling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      {isInstalling ? "Installing" : "Install"}
    </button>
  );
}

// ── Skill detail modal ──────────────────────────────────────────────

interface InspectData {
  skill?: {
    slug?: string;
    displayName?: string;
    summary?: string;
    stats?: { stars?: number; downloads?: number; installsAllTime?: number; installsCurrent?: number; versions?: number };
    createdAt?: number;
    updatedAt?: number;
  };
  latestVersion?: { version?: string; changelog?: string; license?: string | null };
  owner?: { handle?: string; displayName?: string; image?: string };
}

function SkillDetailModal({
  botId, skill, isInstalling, onInstall, onUninstall, onClose,
}: {
  botId: string;
  skill: import("../lib/types").Skill;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onClose: () => void;
}) {
  const [inspectData, setInspectData] = useState<InspectData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<import("../lib/types").SkillRequirements | null>(null);

  const fetchInspect = useCallback(async () => {
    setInspectLoading(true);
    setInspectError(null);
    try {
      const raw = await api.clawHubInspectSkill(botId, skill.name);
      const data = JSON.parse(raw) as InspectData;
      setInspectData(data);
    } catch {
      setInspectError("Could not fetch details from ClawHub");
    } finally {
      setInspectLoading(false);
    }
  }, [botId, skill.name]);

  // Fetch missing deps for bundled skills that aren't ready
  const fetchRequirements = useCallback(async () => {
    if (skill.source !== "bundled" || skill.installed) return;
    try {
      const reqs = await api.getSkillRequirements(botId, skill.name);
      setRequirements(reqs);
    } catch {
      // Silently fail — deps info is supplementary
    }
  }, [botId, skill.name, skill.source, skill.installed]);

  useEffect(() => {
    fetchInspect();
    fetchRequirements();
  }, [fetchInspect, fetchRequirements]);

  const stats = inspectData?.skill?.stats;
  const owner = inspectData?.owner;
  const version = inspectData?.latestVersion;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center gap-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
                {inspectData?.skill?.displayName || skill.name}
              </h2>
              <SourceBadge source={skill.source} />
              {skill.installed && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <CheckCircle2 className="h-2 w-2" /> Ready
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{skill.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Description */}
          <div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {inspectData?.skill?.summary || skill.description || "No description available."}
            </p>
          </div>

          {/* Missing dependencies (bundled skills only) */}
          {requirements && !requirements.all_met && !requirements.error && (
            <MissingDepsPanel requirements={requirements} />
          )}

          {/* ClawHub stats */}
          {inspectLoading && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Fetching ClawHub details...
            </div>
          )}

          {inspectError && (
            <p className="text-xs text-[var(--text-tertiary)]">{inspectError}</p>
          )}

          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={Star} label="Stars" value={formatCount(stats.stars ?? 0)} />
              <StatCard icon={DownloadCloud} label="Downloads" value={formatCount(stats.downloads ?? 0)} />
              <StatCard icon={Package} label="Installs" value={formatCount(stats.installsCurrent ?? 0)} />
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-2">
            {owner && (
              <MetaRow icon={User} label="Author" value={owner.displayName || owner.handle || "Unknown"} />
            )}
            {!owner && skill.author && (
              <MetaRow icon={User} label="Source" value={skill.author} />
            )}
            {version?.version && (
              <MetaRow icon={Tag} label="Version" value={`v${version.version}`} />
            )}
            {version?.license && (
              <MetaRow icon={Tag} label="License" value={version.license} />
            )}
          </div>

          {/* Link to ClawHub */}
          {skill.source === "clawhub" && (
            <button
              onClick={() => open(`https://clawhub.com/skills/${skill.name}`)}
              className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600"
            >
              <Globe className="h-3.5 w-3.5" />
              View on clawhub.com
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 py-3">
          <ActionButton
            installed={skill.installed}
            isInstalling={isInstalling}
            onInstall={onInstall}
            onUninstall={onUninstall}
            full
            source={skill.source}
          />
        </div>
      </div>
    </div>
  );
}

function MissingDepsPanel({ requirements }: { requirements: import("../lib/types").SkillRequirements }) {
  const hasBins = requirements.bins && requirements.bins.length > 0;
  const hasEnv = requirements.env && requirements.env.length > 0;
  const hasConfig = requirements.config && requirements.config.length > 0;
  const hasOs = requirements.os && requirements.os.length > 0;

  if (!hasBins && !hasEnv && !hasConfig && !hasOs) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Info className="h-3.5 w-3.5" />
        Missing requirements
      </div>
      <div className="mt-2 space-y-1.5">
        {hasBins && (
          <DepRow
            label="CLI tools"
            items={requirements.bins!}
            hint="Install these binaries in the container"
          />
        )}
        {hasEnv && (
          <DepRow
            label="Environment variables"
            items={requirements.env!}
            hint="Set via bot settings → Environment Variables"
          />
        )}
        {hasConfig && (
          <DepRow
            label="Config keys"
            items={requirements.config!}
            hint="Set via openclaw configure in Terminal"
          />
        )}
        {hasOs && (
          <DepRow
            label="Required OS"
            items={requirements.os!}
            hint="This skill only works on this platform"
          />
        )}
      </div>
    </div>
  );
}

function DepRow({ label, items, hint }: { label: string; items: string[]; hint: string }) {
  return (
    <div className="text-xs">
      <span className="font-medium text-amber-800 dark:text-amber-300">{label}: </span>
      {items.map((item, i) => (
        <span key={item}>
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {item}
          </code>
          {i < items.length - 1 && <span className="text-amber-600 dark:text-amber-500">, </span>}
        </span>
      ))}
      <p className="mt-0.5 text-[10px] text-amber-600/80 dark:text-amber-400/60">{hint}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-2 text-center">
      <Icon className="mx-auto h-4 w-4 text-[var(--text-tertiary)]" />
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
      <span className="text-[var(--text-tertiary)]">{label}:</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
