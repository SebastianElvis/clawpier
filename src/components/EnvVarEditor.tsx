import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Save, AlertTriangle } from "lucide-react";
import type { EnvVar } from "../lib/types";
import { useBotStore } from "../stores/bot-store";

interface EnvVarEditorProps {
  botId: string;
  envVars: EnvVar[];
}

export function EnvVarEditor({ botId, envVars }: EnvVarEditorProps) {
  const { updateEnvVars } = useBotStore();
  const [vars, setVars] = useState<EnvVar[]>(() =>
    envVars.length > 0 ? [...envVars] : []
  );
  const [showValues, setShowValues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleAdd = () => {
    setVars([...vars, { key: "", value: "" }]);
    setDirty(true);
  };

  const handleRemove = (index: number) => {
    setVars(vars.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleChange = (
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    const updated = [...vars];
    updated[index] = { ...updated[index], [field]: val };
    setVars(updated);
    setDirty(true);
  };

  const handleSave = async () => {
    // Filter out empty rows
    const filtered = vars.filter((v) => v.key.trim() !== "");
    setSaving(true);
    try {
      await updateEnvVars(botId, filtered);
      setVars(filtered);
      setDirty(false);
    } catch (e) {
      console.error("Failed to save env vars:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          Environment Variables
        </h3>
        <button
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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

      {dirty && (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Changes take effect on next restart
        </div>
      )}

      <div className="space-y-2">
        {vars.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="w-1/3 rounded border border-gray-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="KEY"
              value={v.key}
              onChange={(e) => handleChange(i, "key", e.target.value)}
            />
            <span className="text-gray-300">=</span>
            <input
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              placeholder="value"
              type={showValues ? "text" : "password"}
              value={v.value}
              onChange={(e) => handleChange(i, "value", e.target.value)}
            />
            <button
              className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
              onClick={() => handleRemove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600"
          onClick={handleAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Add variable
        </button>

        {dirty && (
          <button
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        )}
      </div>
    </div>
  );
}
