import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export type RestartPhase = "stopping" | "stopped" | "starting" | "running" | null;

export function useRestartProgress(botId: string) {
  const [phase, setPhase] = useState<RestartPhase>(null);

  useEffect(() => {
    const unlisten = listen<string>(
      `bot-restart-phase-${botId}`,
      (event) => {
        const p = event.payload as RestartPhase;
        setPhase(p);

        // Clear phase after a short delay once running
        if (p === "running") {
          setTimeout(() => setPhase(null), 2000);
        }
      }
    );

    return () => {
      unlisten.then((f) => f());
    };
  }, [botId]);

  return { phase, isRestarting: phase !== null };
}
