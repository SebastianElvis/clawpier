import { useState, useMemo } from "react";
import { useBotStore } from "../stores/bot-store";
import { BotCard } from "./BotCard";
import { EmptyState } from "./EmptyState";
import { BotListHeader, type StatusFilter } from "./BotListHeader";
import { filterBots } from "../lib/filter-bots";

interface BotListProps {
  onCreateBot: () => void;
  onSelectBot: (id: string) => void;
}

export function BotList({ onCreateBot, onSelectBot }: BotListProps) {
  const { bots, loading } = useBotStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredBots = useMemo(
    () => filterBots(bots, searchQuery, statusFilter),
    [bots, searchQuery, statusFilter]
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]"
          />
        ))}
      </div>
    );
  }

  if (bots.length === 0) {
    return <EmptyState onCreateBot={onCreateBot} />;
  }

  return (
    <div>
      <BotListHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        filteredCount={filteredBots.length}
        totalCount={bots.length}
      />

      {filteredBots.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No bots match your filters.</p>
          <button
            className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBots.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onSelect={() => onSelectBot(bot.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
