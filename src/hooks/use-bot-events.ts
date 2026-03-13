import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BotWithStatus } from "../lib/types";
import { useBotStore } from "../stores/bot-store";

export function useBotEvents() {
  const setBots = useBotStore((s) => s.setBots);

  useEffect(() => {
    const unlisten = listen<BotWithStatus[]>("bot-status-update", (event) => {
      setBots(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setBots]);
}
