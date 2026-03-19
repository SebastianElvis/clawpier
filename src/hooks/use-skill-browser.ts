import { useState, useEffect, useCallback, useRef } from "react";
import type { Skill } from "../lib/types";
import * as api from "../lib/tauri";

export type SkillFilter = "all" | "installed";

export function useSkillBrowser(botId: string) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryRaw] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [clawhubAvailable, setClawhubAvailable] = useState<boolean | null>(
    null
  );
  const [installingClawhub, setInstallingClawhub] = useState(false);
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  // Track active bot ID to avoid stale results
  const activeBotRef = useRef(botId);
  activeBotRef.current = botId;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search skills when debounced query changes
  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.clawHubSearchSkills(botId, debouncedQuery);
      if (activeBotRef.current === botId) {
        setSkills(result.skills);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("ClawHub CLI is not available")) {
        setClawhubAvailable(false);
        // Fall back: still show bundled skills (empty query search)
        if (debouncedQuery.trim()) {
          try {
            const fallback = await api.clawHubSearchSkills(botId, "");
            if (activeBotRef.current === botId) {
              // Filter bundled results by query client-side
              const q = debouncedQuery.trim().toLowerCase();
              setSkills(
                fallback.skills.filter(
                  (s) =>
                    s.name.toLowerCase().includes(q) ||
                    s.description.toLowerCase().includes(q)
                )
              );
            }
          } catch {
            setSkills([]);
          }
        }
      } else {
        setError(msg);
      }
    } finally {
      if (activeBotRef.current === botId) {
        setLoading(false);
      }
    }
  }, [botId, debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

  // Reset when bot changes
  useEffect(() => {
    setSkills([]);
    setQueryRaw("");
    setDebouncedQuery("");
    setFilter("all");
    setClawhubAvailable(null);
    setError(null);
    setInstalling(new Set());
    setInstallingClawhub(false);
  }, [botId]);

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
  }, []);

  const installSkill = useCallback(
    async (name: string) => {
      setInstalling((prev) => new Set(prev).add(name));
      setError(null);
      try {
        const result = await api.clawHubInstallSkill(botId, name);
        if (result.exit_code && result.exit_code !== 0) {
          // Non-zero exit — show the last line of output as error
          const lines = result.output.trim().split("\n").filter(Boolean);
          const msg = lines.pop() || "Unknown error";
          setError(`Install failed for ${name}: ${msg}`);
        } else {
          // Success — mark as installed in local state
          setSkills((prev) =>
            prev.map((s) => (s.name === name ? { ...s, installed: true } : s))
          );
        }
      } catch (e) {
        setError(`Install failed: ${e}`);
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    },
    [botId]
  );

  const uninstallSkill = useCallback(
    async (name: string) => {
      setInstalling((prev) => new Set(prev).add(name));
      setError(null);
      try {
        const result = await api.clawHubUninstallSkill(botId, name);
        if (result.exit_code && result.exit_code !== 0) {
          const lines = result.output.trim().split("\n").filter(Boolean);
          const msg = lines.pop() || "Unknown error";
          setError(`Uninstall failed for ${name}: ${msg}`);
        } else {
          setSkills((prev) =>
            prev.map((s) => (s.name === name ? { ...s, installed: false } : s))
          );
        }
      } catch (e) {
        setError(`Uninstall failed: ${e}`);
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    },
    [botId]
  );

  const installClawhub = useCallback(async () => {
    setInstallingClawhub(true);
    setError(null);
    try {
      await api.installClawHub(botId);
      setClawhubAvailable(true);
      // Re-run search now that clawhub is available
      search();
    } catch (e) {
      setError(`Failed to install ClawHub CLI: ${e}`);
    } finally {
      setInstallingClawhub(false);
    }
  }, [botId, search]);

  const filteredSkills =
    filter === "installed" ? skills.filter((s) => s.installed) : skills;

  // Whether the current results are from clawhub registry
  const isRegistrySearch =
    debouncedQuery.trim().length > 0 && clawhubAvailable !== false;

  return {
    skills: filteredSkills,
    allSkills: skills,
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
    refresh: search,
  };
}
