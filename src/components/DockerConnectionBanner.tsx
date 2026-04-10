import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { WifiOff } from "lucide-react";

export function DockerConnectionBanner() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const unlisten1 = listen("docker-connection-lost", () => {
      setConnected(false);
    });
    const unlisten2 = listen("docker-connection-restored", () => {
      setConnected(true);
    });

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, []);

  if (connected) return null;

  return (
    <div className="bg-[var(--badge-amber-bg)] border-b border-[var(--badge-amber-border)] px-4 py-2 flex items-center gap-2 text-[var(--badge-amber-text)] text-sm">
      <WifiOff className="h-4 w-4 animate-pulse" />
      <span>Docker connection lost — retrying...</span>
    </div>
  );
}
