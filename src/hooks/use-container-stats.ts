import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ContainerStats } from "../lib/types";
import * as api from "../lib/tauri";

export function useContainerStats(botId: string, enabled: boolean) {
  const [stats, setStats] = useState<ContainerStats | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStats(null);
      return;
    }

    // Start streaming
    api.startStatsStream(botId).catch(console.error);

    const unlisten = listen<ContainerStats>(
      `container-stats-${botId}`,
      (event) => {
        setStats(event.payload);
      }
    );

    return () => {
      api.stopStatsStream(botId).catch(console.error);
      unlisten.then((fn) => fn());
      setStats(null);
    };
  }, [botId, enabled]);

  return stats;
}
