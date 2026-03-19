import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useSkillBrowser } from "../use-skill-browser";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

const makeSearchResult = (
  skills: { name: string; installed?: boolean; source?: string }[] = []
) => ({
  skills: skills.map((s) => ({
    name: s.name,
    description: `Desc for ${s.name}`,
    author: "test-author",
    version: "1.0.0",
    installed: s.installed ?? false,
    source: s.source ?? "bundled",
  })),
  total: skills.length,
});

describe("useSkillBrowser", () => {
  it("searches skills on mount after debounce", async () => {
    mockedInvoke.mockResolvedValue(makeSearchResult([{ name: "skill-a" }]));

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.skills).toHaveLength(1);
    });

    expect(mockedInvoke).toHaveBeenCalledWith("clawhub_search_skills", {
      id: "bot-1",
      query: "",
    });
    expect(result.current.skills[0].name).toBe("skill-a");
  });

  it("sets clawhubAvailable to false when CLI missing", async () => {
    mockedInvoke.mockRejectedValue(
      "ClawHub CLI is not available in this container"
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => {
      expect(result.current.clawhubAvailable).toBe(false);
    });
  });

  it("installs a skill and updates local state", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "skill-a", installed: false }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Install — returns ExecResult with exit_code 0
    mockedInvoke.mockResolvedValueOnce({ output: "Installed skill-a\n", exit_code: 0 });

    await act(async () => {
      await result.current.installSkill("skill-a");
    });

    expect(mockedInvoke).toHaveBeenCalledWith("clawhub_install_skill", {
      id: "bot-1",
      skillName: "skill-a",
    });
    expect(result.current.skills[0].installed).toBe(true);
  });

  it("uninstalls a skill and updates local state", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "skill-b", installed: true }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedInvoke.mockResolvedValueOnce({ output: "Removed skill-b\n", exit_code: 0 });

    await act(async () => {
      await result.current.uninstallSkill("skill-b");
    });

    expect(mockedInvoke).toHaveBeenCalledWith("clawhub_uninstall_skill", {
      id: "bot-1",
      skillName: "skill-b",
    });
    expect(result.current.skills[0].installed).toBe(false);
  });

  it("filters to installed only", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([
        { name: "installed-one", installed: true },
        { name: "not-installed", installed: false },
      ])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.skills).toHaveLength(2);

    act(() => result.current.setFilter("installed"));

    expect(result.current.skills).toHaveLength(1);
    expect(result.current.skills[0].name).toBe("installed-one");
  });

  it("sets error on install failure", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "fail-skill" }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedInvoke.mockRejectedValueOnce("network error");

    await act(async () => {
      await result.current.installSkill("fail-skill");
    });

    expect(result.current.error).toContain("Install failed");
  });

  it("shows error when install returns non-zero exit code", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "bad-skill" }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedInvoke.mockResolvedValueOnce({
      output: "npm warn\nError: skill not found in registry",
      exit_code: 1,
    });

    await act(async () => {
      await result.current.installSkill("bad-skill");
    });

    expect(result.current.error).toContain("Install failed for bad-skill");
    expect(result.current.error).toContain("skill not found in registry");
    // Should NOT have marked as installed
    expect(result.current.skills[0].installed).toBe(false);
  });

  it("exposes isRegistrySearch correctly", async () => {
    mockedInvoke.mockResolvedValue(
      makeSearchResult([{ name: "weather", source: "clawhub" }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No query = not registry search
    expect(result.current.isRegistrySearch).toBe(false);
  });

  it("resets state when botId changes", async () => {
    mockedInvoke.mockResolvedValue(
      makeSearchResult([{ name: "skill-a", installed: true }])
    );

    const { result, rerender } = renderHook(
      ({ botId }) => useSkillBrowser(botId),
      { initialProps: { botId: "bot-1" } }
    );

    await waitFor(() => expect(result.current.skills).toHaveLength(1));

    mockedInvoke.mockResolvedValue(makeSearchResult([]));
    rerender({ botId: "bot-2" });

    // After bot change, skills should be cleared before refetch
    await waitFor(() => {
      expect(result.current.query).toBe("");
      expect(result.current.filter).toBe("all");
    });
  });

  it("handles uninstall with non-zero exit code", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "fail-uninstall", installed: true }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedInvoke.mockResolvedValueOnce({
      output: "npm warn\nError: permission denied",
      exit_code: 1,
    });

    await act(async () => {
      await result.current.uninstallSkill("fail-uninstall");
    });

    expect(result.current.error).toContain("Uninstall failed for fail-uninstall");
    expect(result.current.error).toContain("permission denied");
    // Should remain installed
    expect(result.current.skills[0].installed).toBe(true);
  });

  it("tracks installing state during install/uninstall", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "track-skill" }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Start install but don't resolve yet
    let resolveInstall: (v: unknown) => void;
    mockedInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInstall = resolve;
      })
    );

    let installPromise: Promise<void>;
    act(() => {
      installPromise = result.current.installSkill("track-skill");
    });

    // Should be in installing set
    expect(result.current.installing.has("track-skill")).toBe(true);

    // Resolve and wait
    await act(async () => {
      resolveInstall!({ output: "done", exit_code: 0 });
      await installPromise!;
    });

    expect(result.current.installing.has("track-skill")).toBe(false);
  });

  it("clears error on new install attempt", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([{ name: "retry-skill" }])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First install fails
    mockedInvoke.mockRejectedValueOnce("network error");
    await act(async () => {
      await result.current.installSkill("retry-skill");
    });
    expect(result.current.error).toContain("Install failed");

    // Second install attempt should clear error
    mockedInvoke.mockResolvedValueOnce({ output: "done", exit_code: 0 });
    await act(async () => {
      await result.current.installSkill("retry-skill");
    });
    expect(result.current.error).toBeNull();
  });

  it("falls back to bundled skills when clawhub unavailable during search", async () => {
    // First call (mount, empty query) succeeds
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([
        { name: "weather", source: "bundled" },
        { name: "slack", source: "bundled" },
      ])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate typing a search query
    act(() => result.current.setQuery("weather"));

    // The search with query will fail (clawhub unavailable)
    mockedInvoke.mockRejectedValueOnce(
      "ClawHub CLI is not available in this container"
    );
    // Fallback empty-query call succeeds
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([
        { name: "weather", source: "bundled" },
        { name: "slack", source: "bundled" },
      ])
    );

    await waitFor(() => {
      expect(result.current.clawhubAvailable).toBe(false);
      // Should filter bundled results by "weather"
      expect(result.current.skills.length).toBeGreaterThanOrEqual(1);
      expect(result.current.skills.every((s) => s.name.includes("weather"))).toBe(true);
    });
  });

  it("preserves source field from search results", async () => {
    mockedInvoke.mockResolvedValueOnce(
      makeSearchResult([
        { name: "bundled-skill", source: "bundled" },
        { name: "remote-skill", source: "clawhub" },
      ])
    );

    const { result } = renderHook(() => useSkillBrowser("bot-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.skills[0].source).toBe("bundled");
    expect(result.current.skills[1].source).toBe("clawhub");
  });

  it("search error sets error state", async () => {
    mockedInvoke.mockRejectedValueOnce("Docker timeout");

    const { result } = renderHook(() => useSkillBrowser("bot-1"));

    await waitFor(() => {
      expect(result.current.error).toBe("Docker timeout");
      expect(result.current.loading).toBe(false);
    });
  });
});
