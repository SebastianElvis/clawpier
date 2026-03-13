import { useEffect, useRef, useState } from "react";
import { ArrowDown, Trash2 } from "lucide-react";
import type { LogEntry } from "../lib/types";

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogViewer({ logs, onClear }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user scrolled up more than 50px from bottom, disable auto-scroll
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5">
        <span className="text-xs text-gray-400">
          {logs.length} {logs.length === 1 ? "line" : "lines"}
        </span>
        <div className="flex items-center gap-1">
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
          <button
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClear}
            title="Clear logs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-950 p-3 font-mono text-xs leading-5"
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            Waiting for logs...
          </div>
        ) : (
          logs.map((entry, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-all ${
                entry.stream === "stderr" ? "text-red-400" : "text-gray-200"
              }`}
            >
              {entry.timestamp && (
                <span className="mr-2 text-gray-600">
                  {formatTimestamp(entry.timestamp)}
                </span>
              )}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts.slice(11, 19); // fallback: extract HH:MM:SS
  }
}
