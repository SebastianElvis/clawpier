import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HealthUpdate } from "../lib/types";
import { useToastStore } from "../stores/toast-store";

/**
 * Subscribe to bot-health-update events from the Rust backend.
 * Maintains a map of latest health state per bot.
 * Shows a toast when a bot becomes unhealthy.
 */
export function useHealthEvents() {
  // Track which bots we already toasted about to avoid spam
  const toastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<HealthUpdate>("bot-health-update", (event) => {
      const { bot_id, healthy, consecutive_failures } = event.payload;
      const toast = useToastStore.getState().addToast;

      if (!healthy && consecutive_failures >= 3 && !toastedRef.current.has(bot_id)) {
        toastedRef.current.add(bot_id);
        toast({
          type: "error",
          title: "Health check failing",
          description: `Bot has failed ${consecutive_failures} consecutive health checks.`,
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
