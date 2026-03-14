import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ContainerStats } from "../lib/types";
import * as api from "../lib/tauri";

const MAX_HISTORY = 60;

export function useContainerStats(botId: string, enabled: boolean) {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsHistory, setStatsHistory] = useState<ContainerStats[]>([]);
  const historyRef = useRef<ContainerStats[]>([]);

  useEffect(() => {
    if (!enabled) {
      historyRef.current = [];
      return;
    }

    // Start streaming
    api.startStatsStream(botId).catch(console.error);

    const unlisten = listen<ContainerStats>(
      `container-stats-${botId}`,
      (event) => {
        setStats(event.payload);
        const next = [...historyRef.current, event.payload];
        if (next.length > MAX_HISTORY) next.shift();
        historyRef.current = next;
        setStatsHistory(next);
      }
    );

    return () => {
      api.stopStatsStream(botId).catch(console.error);
      unlisten.then((fn) => fn());
      historyRef.current = [];
      setStatsHistory([]);
    };
  }, [botId, enabled]);

  if (!enabled) {
    return { stats: null, statsHistory: [] };
  }

  return { stats, statsHistory };
}
