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
      className: "bg-orange-50 text-orange-700",
    };
  }
  if (mode === "host") {
    return {
      icon: Globe,
      label: "Host",
      className: "bg-red-50 text-red-700",
    };
  }
  if (typeof mode === "object" && "custom" in mode) {
    return {
      icon: Network,
      label: mode.custom,
      className: "bg-purple-50 text-purple-700",
    };
  }
  return {
    icon: Shield,
    label: "Sandboxed",
    className: "bg-gray-50 text-gray-600",
  };
}
