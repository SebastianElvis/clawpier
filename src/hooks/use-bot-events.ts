import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BotWithStatus } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { useToastStore } from "../stores/toast-store";

export function useBotEvents() {
  const setBots = useBotStore((s) => s.setBots);
  const setDockerConnected = useBotStore((s) => s.setDockerConnected);

  useEffect(() => {
    const unlisten = listen<BotWithStatus[]>("bot-status-update", (event) => {
      setBots(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setBots]);

  useEffect(() => {
    const unlistenLost = listen("docker-connection-lost", () => {
      setDockerConnected(false);
      useToastStore
        .getState()
        .addToast({ type: "warning", title: "Docker connection lost" });
    });

    const unlistenRestored = listen("docker-connection-restored", () => {
      setDockerConnected(true);
      useToastStore
        .getState()
        .addToast({ type: "success", title: "Docker reconnected" });
    });

    return () => {
      unlistenLost.then((fn) => fn());
      unlistenRestored.then((fn) => fn());
    };
  }, [setDockerConnected]);
}
