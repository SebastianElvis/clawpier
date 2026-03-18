import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import type { EnvVar } from "../lib/types";

interface EnvVarEditorProps {
  envVars: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
}

export function EnvVarEditor({ envVars, onChange }: EnvVarEditorProps) {
  // User override — null means "show prop default"
  const [userVars, setUserVars] = useState<EnvVar[] | null>(null);
  const [showValues, setShowValues] = useState(false);

  // Effective value: user override → prop
  const vars = userVars ?? envVars;

  const handleAdd = () => {
    const updated = [...vars, { key: "", value: "" }];
    setUserVars(updated);
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = vars.filter((_, i) => i !== index);
    setUserVars(updated);
    onChange(updated);
  };

  const handleChange = (
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    const updated = [...vars];
    updated[index] = { ...updated[index], [field]: val };
    setUserVars(updated);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          Environment Variables
        </h3>
        <button
          className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          onClick={() => setShowValues(!showValues)}
          title={showValues ? "Hide values" : "Show values"}
        >
          {showValues ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="space-y-2">
        {vars.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="w-1/3 rounded border border-[var(--border-primary)] bg-[var(--bg-input)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="KEY"
              value={v.key}
              onChange={(e) => handleChange(i, "key", e.target.value)}
            />
            <span className="text-[var(--text-tertiary)]">=</span>
            <input
              className="flex-1 rounded border border-[var(--border-primary)] bg-[var(--bg-input)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="value"
              type={showValues ? "text" : "password"}
              value={v.value}
              onChange={(e) => handleChange(i, "value", e.target.value)}
            />
            <button
              className="rounded p-1 text-[var(--text-tertiary)] hover:bg-red-50 hover:text-red-500"
              onClick={() => handleRemove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        onClick={handleAdd}
      >
        <Plus className="h-3.5 w-3.5" />
        Add variable
      </button>
    </div>
  );
}
