import { Plus } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  onCreateBot: () => void;
  botCount: number;
}

export function Layout({ children, onCreateBot, botCount }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col">
      {/* Header with drag region */}
      <header
        className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-3" data-tauri-drag-region>
          <h1
            className="text-sm font-bold tracking-tight text-gray-900"
            data-tauri-drag-region
          >
            ClawPier
          </h1>
          <span className="text-[10px] text-gray-400" data-tauri-drag-region>
            v0.1.0
          </span>
          {botCount > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {botCount} bot{botCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {botCount > 0 && (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            onClick={onCreateBot}
          >
            <Plus className="h-3.5 w-3.5" />
            New Bot
          </button>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
