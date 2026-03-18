import { useRef } from "react";
import { Search, X } from "lucide-react";

export type StatusFilter = "all" | "running" | "stopped";

interface BotListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  filteredCount: number;
  totalCount: number;
}

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
];

export function BotListHeader({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  filteredCount,
  totalCount,
}: BotListHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const isFiltered = searchQuery !== "" || statusFilter !== "all";

  return (
    <div className="sticky top-0 z-10 -mx-6 mb-3 space-y-2 bg-[var(--bg-primary)] px-6 pb-2 pt-1">
      {/* Search + filters row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search bots..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSearchChange("");
                inputRef.current?.blur();
              }
            }}
            className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-input)] py-1 pl-7 pr-7 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-colors focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
          />
          {searchQuery && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              onClick={() => {
                onSearchChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        {filterOptions.map((option) => (
          <button
            key={option.value}
            className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              statusFilter === option.value
                ? "bg-blue-600 text-white"
                : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]"
            }`}
            onClick={() => onStatusFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}

        {/* Filtered count */}
        {totalCount > 0 && (
          <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
            {isFiltered
              ? `${filteredCount}/${totalCount}`
              : `${totalCount}`}
          </span>
        )}
      </div>
    </div>
  );
}
