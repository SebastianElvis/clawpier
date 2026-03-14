import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "../lib/types";
import * as api from "../lib/tauri";

const MAX_LOGS = 1000;

export function useContainerLogs(botId: string, enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Start streaming with last 200 lines
    api.startLogStream(botId, 200).catch(console.error);

    const unlisten = listen<LogEntry>(
      `container-log-${botId}`,
      (event) => {
        const entry = event.payload;
        logsRef.current = [...logsRef.current, entry].slice(-MAX_LOGS);
        setLogs(logsRef.current);
      }
    );

    return () => {
      api.stopLogStream(botId).catch(console.error);
      unlisten.then((fn) => fn());
      logsRef.current = [];
    };
  }, [botId, enabled]);

  // Derive empty logs when disabled — no setState needed
  const effectiveLogs = enabled ? logs : [];

  const clearLogs = useCallback(() => {
    setLogs([]);
    logsRef.current = [];
  }, []);

  return { logs: effectiveLogs, clearLogs };
}
