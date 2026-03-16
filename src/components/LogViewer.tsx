import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Download,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { LogEntry } from "../lib/types";
import { useToast } from "../hooks/use-toast";
import * as api from "../lib/tauri";

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  tail: number;
  onTailChange: (tail: number) => void;
}

type StreamFilter = "all" | "stdout" | "stderr";

const TAIL_OPTIONS = [100, 500, 2000, 5000];

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts.slice(11, 19);
  }
}

function formatLogsAsText(logs: LogEntry[]): string {
  return logs
    .map((log) => {
      const time = log.timestamp
        ? new Date(log.timestamp).toLocaleTimeString()
        : "---";
      return `[${time}] [${log.stream}] ${log.message}`;
    })
    .join("\n");
}

export function LogViewer({ logs, onClear, tail, onTailChange }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const matchRefs = useRef<Map<number, HTMLElement>>(new Map());
  const { toast } = useToast();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentMatchIndex(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filter logs by stream type
  const streamFilteredLogs = useMemo(() => {
    if (streamFilter === "all") return logs;
    return logs.filter((entry) => entry.stream === streamFilter);
  }, [logs, streamFilter]);

  // Compute match indices for search
  const matchIndices = useMemo(() => {
    if (!debouncedSearch) return [];
    const term = debouncedSearch.toLowerCase();
    const indices: number[] = [];
    streamFilteredLogs.forEach((entry, i) => {
      if (entry.message.toLowerCase().includes(term)) {
        indices.push(i);
      }
    });
    return indices;
  }, [streamFilteredLogs, debouncedSearch]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Scroll to current match
  useEffect(() => {
    if (matchIndices.length === 0) return;
    const logIndex = matchIndices[currentMatchIndex];
    if (logIndex === undefined) return;
    const el = matchRefs.current.get(logIndex);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentMatchIndex, matchIndices]);

  // Keyboard shortcut: Cmd+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const navigateMatch = useCallback(
    (direction: "up" | "down") => {
      if (matchIndices.length === 0) return;
      setCurrentMatchIndex((prev) => {
        if (direction === "down") {
          return prev + 1 >= matchIndices.length ? 0 : prev + 1;
        } else {
          return prev - 1 < 0 ? matchIndices.length - 1 : prev - 1;
        }
      });
    },
    [matchIndices.length]
  );

  const handleCopy = useCallback(async () => {
    const text = formatLogsAsText(streamFilteredLogs);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Logs copied to clipboard");
    } catch {
      toast.error("Failed to copy logs");
    }
  }, [streamFilteredLogs, toast]);

  const handleExport = useCallback(async () => {
    const text = formatLogsAsText(streamFilteredLogs);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: `clawpier-logs-${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: "Log files", extensions: ["log", "txt"] }],
      });
      if (path) {
        await api.exportLogs(path, text);
        toast.success("Logs exported");
      }
    } catch {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Logs copied to clipboard (file export unavailable)");
      } catch {
        toast.error("Failed to export logs");
      }
    }
  }, [streamFilteredLogs, toast]);

  // Register match element ref
  const setMatchRef = useCallback(
    (logIndex: number, el: HTMLElement | null) => {
      if (el) {
        matchRefs.current.set(logIndex, el);
      } else {
        matchRefs.current.delete(logIndex);
      }
    },
    []
  );

  // Handle search keyboard navigation
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigateMatch(e.shiftKey ? "up" : "down");
    } else if (e.key === "Escape") {
      setSearchTerm("");
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5">
        {/* Search input */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search logs..."
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1 pl-7 pr-20 text-xs text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400"
          />
          {debouncedSearch && (
            <div className="absolute right-1 flex items-center gap-0.5">
              <span className="mr-1 text-xs text-gray-400">
                {matchIndices.length > 0
                  ? `${currentMatchIndex + 1} of ${matchIndices.length}`
                  : "0 results"}
              </span>
              <button
                onClick={() => navigateMatch("up")}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => navigateMatch("down")}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Next match (Enter)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setSearchTerm("")}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Clear search (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Stream filter pills */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {(["all", "stdout", "stderr"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStreamFilter(filter)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                streamFilter === filter
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Tail selector */}
        <select
          value={tail}
          onChange={(e) => onTailChange(Number(e.target.value))}
          className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 outline-none"
          title="Lines to load"
        >
          {TAIL_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {/* Copy button */}
        <button
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={handleCopy}
          title="Copy all visible logs"
        >
          <Clipboard className="h-3.5 w-3.5" />
        </button>

        {/* Export button */}
        <button
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={handleExport}
          title="Export logs to file"
        >
          <Download className="h-3.5 w-3.5" />
        </button>

        {/* Clear button */}
        <button
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={onClear}
          title="Clear logs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Scroll to bottom */}
        {!autoScroll && (
          <button
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) {
                containerRef.current.scrollTop =
                  containerRef.current.scrollHeight;
              }
            }}
            title="Scroll to bottom"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Line count */}
        <span className="whitespace-nowrap text-xs text-gray-400">
          {streamFilteredLogs.length} {streamFilteredLogs.length === 1 ? "line" : "lines"}
        </span>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-950 p-3 font-mono text-xs leading-5"
        onScroll={handleScroll}
      >
        {streamFilteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            {logs.length === 0 ? "Waiting for logs..." : "No matching logs"}
          </div>
        ) : (
          streamFilteredLogs.map((entry, i) => {
            const isMatch =
              debouncedSearch !== "" &&
              entry.message.toLowerCase().includes(debouncedSearch.toLowerCase());
            const isCurrentMatch =
              isMatch && matchIndices[currentMatchIndex] === i;

            return (
              <div
                key={i}
                ref={isMatch ? (el) => setMatchRef(i, el) : undefined}
                className={`whitespace-pre-wrap break-all ${
                  entry.stream === "stderr" ? "text-red-400" : "text-gray-200"
                }`}
              >
                {entry.timestamp && (
                  <span className="mr-2 text-gray-600">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                )}
                {debouncedSearch
                  ? renderHighlightedMessage(
                      entry.message,
                      debouncedSearch,
                      isCurrentMatch
                    )
                  : entry.message}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function renderHighlightedMessage(
  message: string,
  search: string,
  isCurrentMatch: boolean
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lowerMessage = message.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let lastIndex = 0;

  let idx = lowerMessage.indexOf(lowerSearch, lastIndex);
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push(message.slice(lastIndex, idx));
    }
    parts.push(
      <mark
        key={idx}
        className={`rounded-sm ${
          isCurrentMatch
            ? "bg-yellow-500/60 text-yellow-100"
            : "bg-yellow-500/30 text-yellow-200"
        }`}
      >
        {message.slice(idx, idx + search.length)}
      </mark>
    );
    lastIndex = idx + search.length;
    idx = lowerMessage.indexOf(lowerSearch, lastIndex);
  }

  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }

  return <>{parts}</>;
}
