import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HealthUpdate } from "../lib/types";
import { useNotificationStore } from "../stores/notification-store";
import { useBotStore } from "../stores/bot-store";

/**
 * Subscribe to bot-health-update events from the Rust backend.
 * Maintains a map of latest health state per bot.
 * Shows a notification when a bot becomes unhealthy.
 */
export function useHealthEvents() {
  // Track which bots we already notified about to avoid spam
  const toastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<HealthUpdate>("bot-health-update", (event) => {
      const { bot_id, healthy, consecutive_failures } = event.payload;
      const { preferences, addNotification } =
        useNotificationStore.getState();

      if (!preferences.healthAlerts) return;

      if (!healthy && consecutive_failures >= 3 && !toastedRef.current.has(bot_id)) {
        toastedRef.current.add(bot_id);
        const bot = useBotStore.getState().bots.find((b) => b.id === bot_id);
        addNotification({
          type: "error",
          category: "health",
          title: "Health check failing",
          description: `${bot?.name ?? "Bot"} has failed ${consecutive_failures} consecutive health checks.`,
          botId: bot_id,
          botName: bot?.name,
        });
      }

      if (healthy) {
        toastedRef.current.delete(bot_id);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
