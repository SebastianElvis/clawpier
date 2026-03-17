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
    <div className="mb-4 space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
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
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-8 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
        {searchQuery && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === option.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => onStatusFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}

        {/* Filtered count */}
        {totalCount > 0 && (
          <span className="ml-auto text-xs text-gray-400">
            {isFiltered
              ? `${filteredCount} of ${totalCount} bot${totalCount !== 1 ? "s" : ""}`
              : `${totalCount} bot${totalCount !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>
    </div>
  );
}
