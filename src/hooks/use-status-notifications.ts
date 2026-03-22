import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { StatusChangedEvent } from "../lib/types";
import { useNotificationStore } from "../stores/notification-store";

export function useStatusNotifications() {
  useEffect(() => {
    const unlisten = listen<StatusChangedEvent>(
      "bot-status-changed",
      (event) => {
        const { bot_id, bot_name, to } = event.payload;
        const { preferences, addNotification } =
          useNotificationStore.getState();

        if (!preferences.statusAlerts) return;

        if (to === "Error") {
          addNotification({
            type: "error",
            category: "status",
            title: `${bot_name} crashed`,
            description: "The bot encountered an error and stopped running.",
            botId: bot_id,
            botName: bot_name,
          });
        } else if (to === "Stopped") {
          addNotification({
            type: "warning",
            category: "status",
            title: `${bot_name} stopped unexpectedly`,
            botId: bot_id,
            botName: bot_name,
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
