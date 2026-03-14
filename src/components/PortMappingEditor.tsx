import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { NetworkMode, PortMapping } from "../lib/types";

interface PortMappingEditorProps {
  portMappings: PortMapping[];
  networkMode: NetworkMode;
  onChange: (mappings: PortMapping[]) => void;
}

export function PortMappingEditor({
  portMappings,
  networkMode,
  onChange,
}: PortMappingEditorProps) {
  // User override — null means "show prop default"
  const [userMappings, setUserMappings] = useState<PortMapping[] | null>(null);

  // Effective value: user override → prop
  const mappings = userMappings ?? portMappings;

  // Port mappings only make sense with bridge or host networking
  const modeKey = typeof networkMode === "string" ? networkMode : "custom";
  const disabled = modeKey === "none";

  const addMapping = () => {
    const updated = [
      ...mappings,
      { container_port: 3000, host_port: 3000, protocol: "tcp" as const },
    ];
    setUserMappings(updated);
    onChange(updated);
  };

  const removeMapping = (index: number) => {
    const updated = mappings.filter((_, i) => i !== index);
    setUserMappings(updated);
    onChange(updated);
  };

  const updateMapping = (
    index: number,
    field: keyof PortMapping,
    value: string | number
  ) => {
    const updated = [...mappings];
    if (field === "protocol") {
      updated[index] = { ...updated[index], protocol: value as "tcp" | "udp" };
    } else {
      const num = typeof value === "string" ? parseInt(value) || 0 : value;
      updated[index] = { ...updated[index], [field]: num };
    }
    setUserMappings(updated);
    onChange(updated);
  };

  if (disabled) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Port Mappings</h3>
        <p className="text-xs text-gray-400 italic">
          Port mappings are not available in sandboxed (no network) mode.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Port Mappings</h3>
      <p className="text-xs text-gray-400">
        Expose container ports to the host for webhooks and API access.
      </p>

      {mappings.length > 0 && (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            <span>Container</span>
            <span>Host</span>
            <span>Protocol</span>
            <span />
          </div>
          {/* Rows */}
          {mappings.map((m, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_80px_32px] items-center gap-2"
            >
              <input
                type="number"
                min={1}
                max={65535}
                value={m.container_port}
                onChange={(e) =>
                  updateMapping(i, "container_port", e.target.value)
                }
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-300"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={m.host_port}
                onChange={(e) =>
                  updateMapping(i, "host_port", e.target.value)
                }
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-300"
              />
              <select
                value={m.protocol}
                onChange={(e) =>
                  updateMapping(i, "protocol", e.target.value)
                }
                className="rounded-md border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-blue-300"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
              <button
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => removeMapping(i)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600"
        onClick={addMapping}
      >
        <Plus className="h-3 w-3" />
        Add Port
      </button>
    </div>
  );
}
