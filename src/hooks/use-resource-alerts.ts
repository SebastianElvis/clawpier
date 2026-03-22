import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ContainerStats } from "../lib/types";
import { useBotStore } from "../stores/bot-store";
import { useNotificationStore } from "../stores/notification-store";

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Monitors container stats events for all running bots and fires
 * notifications when CPU or memory usage exceeds configured thresholds.
 */
export function useResourceAlerts(): void {
  // Track cooldowns: keys like "{botId}-cpu" / "{botId}-memory" → timestamp of last alert
  const cooldownRef = useRef<Map<string, number>>(new Map());

  const bots = useBotStore((s) => s.bots);
  const runningBots = bots.filter((b) => b.status.type === "Running");
  const runningBotIds = runningBots.map((b) => b.id).join(",");

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    for (const bot of runningBots) {
      const unlisten = listen<ContainerStats>(
        `container-stats-${bot.id}`,
        (event) => {
          const prefs = useNotificationStore.getState().preferences;

          // Global kill-switch for resource alerts
          if (!prefs.resourceAlerts) return;

          const stats = event.payload;
          const now = Date.now();
          const cooldowns = cooldownRef.current;

          const memThreshold = prefs.memoryThresholdPercent;

          // CPU threshold scales with the number of cores available to the
          // container. Docker reports cpu_percent as (usage / system) * cores * 100,
          // so a 2-core container can reach 200%. The threshold (default 90%)
          // is per-core, so we multiply by the core count.
          const cores = bot.cpu_limit ?? stats.cpu_cores ?? 1;
          const cpuThreshold = prefs.cpuThresholdPercent * cores;

          // --- CPU check ---
          const cpuKey = `${bot.id}-cpu`;
          if (stats.cpu_percent >= cpuThreshold) {
            const lastAlert = cooldowns.get(cpuKey) ?? 0;
            if (now - lastAlert >= COOLDOWN_MS) {
              cooldowns.set(cpuKey, now);
              useNotificationStore.getState().addNotification({
                type: "warning",
                category: "resource",
                title: "High CPU usage",
                description: `${bot.name} is using ${stats.cpu_percent.toFixed(1)}% CPU across ${cores} core${cores !== 1 ? "s" : ""} (threshold: ${cpuThreshold.toFixed(0)}%)`,
                botId: bot.id,
                botName: bot.name,
              });
            }
          } else {
            // Reset cooldown when metric drops below threshold
            cooldowns.delete(cpuKey);
          }

          // --- Memory check ---
          const memKey = `${bot.id}-memory`;
          if (stats.memory_percent >= memThreshold) {
            const lastAlert = cooldowns.get(memKey) ?? 0;
            if (now - lastAlert >= COOLDOWN_MS) {
              cooldowns.set(memKey, now);
              useNotificationStore.getState().addNotification({
                type: "warning",
                category: "resource",
                title: "High memory usage",
                description: `${bot.name} is using ${stats.memory_percent.toFixed(1)}% memory (threshold: ${memThreshold}%)`,
                botId: bot.id,
                botName: bot.name,
              });
            }
          } else {
            // Reset cooldown when metric drops below threshold
            cooldowns.delete(memKey);
          }
        }
      );

      unlisteners.push(unlisten);
    }

    return () => {
      for (const unlisten of unlisteners) {
        unlisten.then((fn) => fn());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningBotIds]);
}
