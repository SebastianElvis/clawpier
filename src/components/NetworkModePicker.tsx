import { useState } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import type { NetworkMode } from "../lib/types";

interface NetworkModePickerProps {
  networkMode: NetworkMode;
  onChange: (mode: NetworkMode) => void;
}

type SimpleMode = "none" | "bridge" | "host" | "custom";

function getModeKey(mode: NetworkMode): SimpleMode {
  if (typeof mode === "string") return mode;
  return "custom";
}

function getCustomName(mode: NetworkMode): string {
  if (typeof mode === "object" && "custom" in mode) return mode.custom;
  return "";
}

const MODE_OPTIONS: { key: SimpleMode; label: string; description: string }[] = [
  { key: "bridge", label: "Bridge", description: "Default Docker networking" },
  { key: "none", label: "Sandboxed", description: "No network access" },
  { key: "host", label: "Host", description: "Full host network access" },
  { key: "custom", label: "Custom", description: "Named Docker network" },
];

export function NetworkModePicker({
  networkMode,
  onChange,
}: NetworkModePickerProps) {
  // User overrides — null means "show prop default"
  const [userMode, setUserMode] = useState<SimpleMode | null>(null);
  const [userCustomName, setUserCustomName] = useState<string | null>(null);

  // Effective values: user override → derived from prop
  const mode = userMode ?? getModeKey(networkMode);
  const customName = userCustomName ?? getCustomName(networkMode);

  const handleModeChange = (newMode: SimpleMode) => {
    setUserMode(newMode);
    const resolved: NetworkMode =
      newMode === "custom" ? { custom: customName } : newMode;
    onChange(resolved);
  };

  const handleCustomNameChange = (name: string) => {
    setUserCustomName(name);
    onChange({ custom: name });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Network Mode</h3>
      <p className="text-xs text-gray-400">
        Control how this bot connects to the network.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`rounded-lg border p-2.5 text-left transition-colors ${
              mode === opt.key
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
            onClick={() => handleModeChange(opt.key)}
          >
            <div className="flex items-center gap-1.5">
              <Shield
                className={`h-3 w-3 ${
                  mode === opt.key ? "text-blue-600" : "text-gray-400"
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  mode === opt.key ? "text-blue-700" : "text-gray-700"
                }`}
              >
                {opt.label}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {opt.description}
            </p>
          </button>
        ))}
      </div>

      {/* Host mode warning */}
      {mode === "host" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] text-amber-700">
            Host mode gives the bot full access to the host network. Only use
            this if you trust the bot completely.
          </p>
        </div>
      )}

      {/* Custom network name input */}
      {mode === "custom" && (
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Docker Network Name</label>
          <input
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
            value={customName}
            onChange={(e) => handleCustomNameChange(e.target.value)}
            placeholder="my-docker-network"
          />
        </div>
      )}
    </div>
  );
}
