import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "../lib/types";
import * as api from "../lib/tauri";

const MAX_LOGS = 5000;

export function useContainerLogs(botId: string, enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tail, setTail] = useState(500);
  const logsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    // Buffer incoming logs and flush to React state in animation frames
    // to avoid excessive re-renders when hundreds of log lines arrive at once.
    let pendingEntries: LogEntry[] = [];
    let rafId: number | null = null;

    const flushLogs = () => {
      rafId = null;
      if (cancelled || pendingEntries.length === 0) return;

      const combined = logsRef.current.concat(pendingEntries);
      pendingEntries = [];

      // Trim to MAX_LOGS
      logsRef.current =
        combined.length > MAX_LOGS
          ? combined.slice(combined.length - MAX_LOGS)
          : combined;

      setLogs(logsRef.current);
    };

    (async () => {
      // Register listener FIRST to ensure no events are missed
      unlistenFn = await listen<LogEntry>(
        `container-log-${botId}`,
        (event) => {
          if (cancelled) return;
          pendingEntries.push(event.payload);
          // Batch updates via requestAnimationFrame
          if (rafId === null) {
            rafId = requestAnimationFrame(flushLogs);
          }
        }
      );

      if (cancelled) {
        unlistenFn();
        return;
      }

      // THEN start the backend stream — listener is guaranteed to be ready
      api.startLogStream(botId, tail).catch(console.error);
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      api.stopLogStream(botId).catch(console.error);
      if (unlistenFn) unlistenFn();
      logsRef.current = [];
    };
  }, [botId, enabled, tail]);

  // Auto-reconnect log stream after restart completes
  useEffect(() => {
    if (!enabled) return;

    const unlisten = listen<string>(
      `bot-restart-phase-${botId}`,
      (event) => {
        if (event.payload === "running") {
          // Re-start the log stream after a brief delay to let the container initialize
          setTimeout(() => {
            api.startLogStream(botId, 500).catch(console.error);
          }, 1000);
        }
      }
    );

    return () => {
      unlisten.then((f) => f());
    };
  }, [botId, enabled]);

  const effectiveLogs = enabled ? logs : [];

  const clearLogs = useCallback(() => {
    setLogs([]);
    logsRef.current = [];
  }, []);

  const changeTail = useCallback((newTail: number) => {
    setTail(newTail);
    // Clear logs when changing tail so we get a fresh load
    setLogs([]);
    logsRef.current = [];
  }, []);

  return { logs: effectiveLogs, clearLogs, tail, changeTail };
}
