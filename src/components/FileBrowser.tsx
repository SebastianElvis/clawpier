import { useEffect, useState, useCallback } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  Home,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import type { FileEntry } from "../lib/types";
import * as api from "../lib/tauri";

interface FileBrowserProps {
  botId: string;
  workspacePath: string;
}

export function FileBrowser({ botId, workspacePath }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{
    name: string;
    content: string;
  } | null>(null);

  const loadDirectory = useCallback(
    async (path?: string) => {
      setLoading(true);
      setError(null);
      setFileContent(null);
      try {
        const files = await api.listWorkspaceFiles(botId, path);
        setEntries(files);
        setCurrentPath(path);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [botId]
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const handleOpenFile = async (file: FileEntry) => {
    if (file.is_dir) {
      loadDirectory(file.path);
      return;
    }
    // Read file content
    try {
      const content = await api.readWorkspaceFile(botId, file.path);
      setFileContent({ name: file.name, content });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleBack = () => {
    if (fileContent) {
      setFileContent(null);
      return;
    }
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    const parent = parts.length > 0 ? parts.join("/") : undefined;
    loadDirectory(parent);
  };

  // Breadcrumb parts
  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border-primary)] px-3 py-2">
        {(currentPath || fileContent) && (
          <button
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            onClick={handleBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          onClick={() => loadDirectory()}
          title={workspacePath}
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center text-xs text-[var(--text-secondary)]">
            <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
            <button
              className="rounded px-1 py-0.5 hover:bg-[var(--bg-hover)]"
              onClick={() =>
                loadDirectory(breadcrumbs.slice(0, i + 1).join("/"))
              }
            >
              {part}
            </button>
          </span>
        ))}
        {fileContent && (
          <span className="flex items-center text-xs text-[var(--text-secondary)]">
            <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
            <span className="px-1 py-0.5 font-medium">{fileContent.name}</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-[var(--badge-red-text)]">{error}</div>
        ) : fileContent ? (
          <pre className="overflow-auto p-4 font-mono text-xs leading-5 text-[var(--text-secondary)]">
            {fileContent.content}
          </pre>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-tertiary)]">
            Empty directory
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-secondary)]">
            {entries.map((entry) => (
              <button
                key={entry.path}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--bg-hover)]"
                onClick={() => handleOpenFile(entry)}
              >
                {entry.is_dir ? (
                  <Folder className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                  {entry.name}
                </span>
                {!entry.is_dir && entry.size != null && (
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                    {formatSize(entry.size)}
                  </span>
                )}
                {entry.is_dir && (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
