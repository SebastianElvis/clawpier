import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BotListHeader, type StatusFilter } from "../BotListHeader";
import { filterBots } from "../../lib/filter-bots";
import type { BotWithStatus } from "../../lib/types";

function renderHeader(overrides: Partial<Parameters<typeof BotListHeader>[0]> = {}) {
  const props = {
    searchQuery: "",
    onSearchChange: vi.fn(),
    statusFilter: "all" as StatusFilter,
    onStatusFilterChange: vi.fn(),
    filteredCount: 5,
    totalCount: 5,
    ...overrides,
  };
  const result = render(<BotListHeader {...props} />);
  return { ...result, props };
}

describe("BotListHeader", () => {
  it("renders search input and filter pills", () => {
    renderHeader();
    expect(screen.getByPlaceholderText("Search bots...")).toBeDefined();
    expect(screen.getByText("All")).toBeDefined();
    expect(screen.getByText("Running")).toBeDefined();
    expect(screen.getByText("Stopped")).toBeDefined();
  });

  it("calls onSearchChange when typing", () => {
    const { props } = renderHeader();
    fireEvent.change(screen.getByPlaceholderText("Search bots..."), {
      target: { value: "my-bot" },
    });
    expect(props.onSearchChange).toHaveBeenCalledWith("my-bot");
  });

  it("clears search on Escape key", () => {
    const { props } = renderHeader({ searchQuery: "test" });
    fireEvent.keyDown(screen.getByPlaceholderText("Search bots..."), {
      key: "Escape",
    });
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });

  it("shows clear button when search has text", () => {
    renderHeader({ searchQuery: "hello" });
    expect(screen.getByLabelText("Clear search")).toBeDefined();
  });

  it("does not show clear button when search is empty", () => {
    renderHeader({ searchQuery: "" });
    expect(screen.queryByLabelText("Clear search")).toBeNull();
  });

  it("calls onSearchChange with empty string when clear button clicked", () => {
    const { props } = renderHeader({ searchQuery: "hello" });
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });

  it("calls onStatusFilterChange when clicking filter pills", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByText("Running"));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("running");
    fireEvent.click(screen.getByText("Stopped"));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("stopped");
    fireEvent.click(screen.getByText("All"));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("all");
  });

  it("shows total count when not filtered", () => {
    renderHeader({ filteredCount: 5, totalCount: 5 });
    expect(screen.getByText("5")).toBeDefined();
  });

  it("shows filtered count when search is active", () => {
    renderHeader({ searchQuery: "test", filteredCount: 2, totalCount: 5 });
    expect(screen.getByText("2/5")).toBeDefined();
  });

  it("shows filtered count when status filter is active", () => {
    renderHeader({ statusFilter: "running", filteredCount: 3, totalCount: 10 });
    expect(screen.getByText("3/10")).toBeDefined();
  });

  it("shows singular count for 1", () => {
    renderHeader({ filteredCount: 1, totalCount: 1 });
    expect(screen.getByText("1")).toBeDefined();
  });
});

describe("filterBots", () => {
  const makeBots = (): BotWithStatus[] => [
    {
      id: "1",
      name: "Alpha Bot",
      image: "ghcr.io/openclaw/openclaw:latest",
      agent_type: "OpenClaw",
      network_mode: "none",
      env_vars: [],
      port_mappings: [],
      auto_start: false,
      status: { type: "Running" },
    },
    {
      id: "2",
      name: "Beta Bot",
      image: "ghcr.io/openclaw/openclaw:latest",
      agent_type: "OpenClaw",
      network_mode: "none",
      env_vars: [],
      port_mappings: [],
      auto_start: false,
      status: { type: "Stopped" },
    },
    {
      id: "3",
      name: "Gamma Bot",
      image: "ghcr.io/openclaw/openclaw:latest",
      agent_type: "OpenClaw",
      network_mode: "none",
      env_vars: [],
      port_mappings: [],
      auto_start: false,
      status: { type: "Running" },
    },
    {
      id: "4",
      name: "Delta Bot",
      image: "ghcr.io/openclaw/openclaw:latest",
      agent_type: "OpenClaw",
      network_mode: "none",
      env_vars: [],
      port_mappings: [],
      auto_start: false,
      status: { type: "Error", message: "Something went wrong" },
    },
  ];

  it("returns all bots when no filters applied", () => {
    const bots = makeBots();
    expect(filterBots(bots, "", "all")).toHaveLength(4);
  });

  it("filters by name case-insensitively", () => {
    const bots = makeBots();
    const result = filterBots(bots, "alpha", "all");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alpha Bot");
  });

  it("filters by name with mixed case", () => {
    const bots = makeBots();
    const result = filterBots(bots, "BETA", "all");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Beta Bot");
  });

  it("filters by running status", () => {
    const bots = makeBots();
    const result = filterBots(bots, "", "running");
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.status.type === "Running")).toBe(true);
  });

  it("filters by stopped status (includes Error)", () => {
    const bots = makeBots();
    const result = filterBots(bots, "", "stopped");
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.status.type !== "Running")).toBe(true);
  });

  it("combines search and status filters", () => {
    const bots = makeBots();
    const result = filterBots(bots, "bot", "running");
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.name)).toEqual(["Alpha Bot", "Gamma Bot"]);
  });

  it("returns empty array when no matches", () => {
    const bots = makeBots();
    expect(filterBots(bots, "nonexistent", "all")).toHaveLength(0);
  });

  it("partial name match works", () => {
    const bots = makeBots();
    const result = filterBots(bots, "amma", "all");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Gamma Bot");
  });
});
