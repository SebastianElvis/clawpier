import { Wifi, Globe, Shield, Network } from "lucide-react";
import type { NetworkMode } from "../lib/types";

interface NetworkBadgeProps {
  mode: NetworkMode;
}

export function NetworkBadge({ mode }: NetworkBadgeProps) {
  if (mode === "none") return null;

  const config = getConfig(mode);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <config.icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function getConfig(mode: NetworkMode) {
  if (mode === "bridge") {
    return {
      icon: Wifi,
      label: "Bridge",
      className: "bg-[var(--badge-orange-bg)] text-[var(--badge-orange-text)]",
    };
  }
  if (mode === "host") {
    return {
      icon: Globe,
      label: "Host",
      className: "bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]",
    };
  }
  if (typeof mode === "object" && "custom" in mode) {
    return {
      icon: Network,
      label: mode.custom,
      className: "bg-[var(--badge-purple-bg)] text-[var(--badge-purple-text)]",
    };
  }
  return {
    icon: Shield,
    label: "Sandboxed",
    className: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
  };
}
