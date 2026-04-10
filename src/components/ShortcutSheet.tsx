import { X } from "lucide-react";
import { FocusTrap } from "./FocusTrap";

interface ShortcutSheetProps {
  onClose: () => void;
}

const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Esc", description: "Go back / close" },
      { keys: "⌘ W", description: "Close detail view" },
      { keys: "⌘ N", description: "New bot" },
    ],
  },
  {
    title: "Tabs",
    shortcuts: [
      { keys: "⌘ 1", description: "Dashboard" },
      { keys: "⌘ 2", description: "Chat" },
      { keys: "⌘ 3", description: "Skills" },
      { keys: "⌘ 4", description: "Terminal" },
      { keys: "⌘ 5", description: "Files" },
      { keys: "⌘ 6", description: "Docker" },
    ],
  },
  {
    title: "Bot Actions",
    shortcuts: [
      { keys: "⌘ ⇧ S", description: "Start bot" },
      { keys: "⌘ ⇧ X", description: "Stop bot" },
      { keys: "⌘ R", description: "Restart bot" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: "⌘ =", description: "Zoom in" },
      { keys: "⌘ -", description: "Zoom out" },
      { keys: "⌘ 0", description: "Reset zoom" },
      { keys: "⌘ /", description: "This sheet" },
    ],
  },
];

export function ShortcutSheet({ onClose }: ShortcutSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <FocusTrap>
        <div className="w-full max-w-lg rounded-xl bg-[var(--bg-elevated)] shadow-2xl ring-1 ring-[var(--border-secondary)]">
          <div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-5 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Keyboard Shortcuts
            </h2>
            <button
              className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
            {SHORTCUT_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {section.title}
                </h3>
                <div className="space-y-1.5">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-xs text-[var(--text-secondary)]">
                        {shortcut.description}
                      </span>
                      <kbd className="shrink-0 rounded border border-[var(--border-primary)] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
