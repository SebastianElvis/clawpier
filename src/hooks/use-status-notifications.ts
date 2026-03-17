import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { StatusChangedEvent } from "../lib/types";
import { useToastStore } from "../stores/toast-store";

export function useStatusNotifications() {
  useEffect(() => {
    const unlisten = listen<StatusChangedEvent>(
      "bot-status-changed",
      (event) => {
        const { bot_name, to } = event.payload;
        const toast = useToastStore.getState().addToast;

        if (to === "Error") {
          toast({
            type: "error",
            title: `${bot_name} crashed`,
            description: "The bot encountered an error and stopped running.",
          });
        } else if (to === "Stopped") {
          toast({
            type: "warning",
            title: `${bot_name} stopped unexpectedly`,
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
