import { Wifi } from "lucide-react";

export function NetworkBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
      <Wifi className="h-3 w-3" />
      Network On
    </span>
  );
}
