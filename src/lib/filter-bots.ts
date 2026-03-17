import type { BotWithStatus } from "./types";
import type { StatusFilter } from "../components/BotListHeader";

export function filterBots(
  bots: BotWithStatus[],
  searchQuery: string,
  statusFilter: StatusFilter
): BotWithStatus[] {
  return bots.filter((bot) => {
    const matchesSearch =
      searchQuery === "" ||
      bot.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "running" && bot.status.type === "Running") ||
      (statusFilter === "stopped" && bot.status.type !== "Running");
    return matchesSearch && matchesStatus;
  });
}
