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
});
