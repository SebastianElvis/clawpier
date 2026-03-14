import { useEffect, useRef, useCallback } from "react";

interface UseAutoRestartOptions {
  botId: string;
  isRunning: boolean;
  activeTab: string;
  isLoading: boolean;
  restartBot: (id: string) => Promise<void>;
  onError: (error: string) => void;
}

/**
 * Auto-restarts a bot ONCE when it stops unexpectedly while the terminal tab
 * is active (e.g. after `openclaw configure` triggers a gateway restart).
 *
 * The one-shot guard prevents restart loops if the container keeps crashing.
 * Call `resetAutoRestart()` after a manual start/stop to re-arm.
 */
export function useAutoRestart({
  botId,
  isRunning,
  activeTab,
  isLoading,
  restartBot,
  onError,
}: UseAutoRestartOptions) {
  const prevRunningRef = useRef(isRunning);
  const autoRestartedRef = useRef(false);

  const resetAutoRestart = useCallback(() => {
    autoRestartedRef.current = false;
  }, []);

  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = isRunning;

    if (
      wasRunning &&
      !isRunning &&
      activeTab === "terminal" &&
      !isLoading &&
      !autoRestartedRef.current
    ) {
      autoRestartedRef.current = true;
      restartBot(botId).catch((e) => onError(String(e)));
    }
  }, [isRunning, activeTab, isLoading, botId, restartBot, onError]);

  return { resetAutoRestart };
}
