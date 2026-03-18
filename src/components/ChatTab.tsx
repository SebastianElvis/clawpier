import { useState, useRef, useEffect } from "react";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  StopCircle,
  Search,
  Copy,
  PanelLeftClose,
  PanelLeft,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useChat } from "../hooks/use-chat";
import { ChatMessageBubble } from "./ChatMessage";

interface ChatTabProps {
  botId: string;
}

export function ChatTab({ botId }: ChatTabProps) {
  const {
    sessions,
    currentSessionId,
    messages,
    streaming,
    streamingContent,
    loading,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    sendMessage,
    stopResponse,
  } = useChat(botId, true);

  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    sendMessage(input);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExport = async () => {
    if (!currentSessionId || messages.length === 0) return;
    const session = sessions.find((s) => s.id === currentSessionId);
    const markdown = messages
      .map((m) =>
        m.role === "user"
          ? `**You:** ${m.content}`
          : `**Assistant:** ${m.content}`
      )
      .join("\n\n---\n\n");

    const content = `# ${session?.name ?? "Chat Session"}\n\n${markdown}\n`;

    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard not available
    }
  };

  // Filter messages by search
  const filteredMessages = searchQuery
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      {sidebarOpen && (
        <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border-primary)] bg-[var(--bg-primary)]">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Sessions</span>
            <div className="flex items-center gap-1">
              <button
                className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)]"
                onClick={() => createSession()}
                title="New session"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)]"
                onClick={() => setSidebarOpen(false)}
                title="Close sidebar"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-3 text-center text-xs text-[var(--text-tertiary)]">
                No sessions yet
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1.5 border-b border-[var(--border-secondary)] px-3 py-2 text-xs cursor-pointer ${
                    currentSessionId === session.id
                      ? "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                  onClick={() => {
                    if (editingId !== session.id) selectSession(session.id);
                  }}
                >
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  {editingId === session.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        className="min-w-0 flex-1 rounded border border-blue-300 bg-[var(--bg-input)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameSession(session.id, editName);
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        className="text-[var(--badge-green-text)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          renameSession(session.id, editName);
                          setEditingId(null);
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        className="text-[var(--text-tertiary)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {session.name}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {session.message_count}
                      </span>
                      <div className="hidden gap-0.5 group-hover:flex">
                        <button
                          className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(session.id);
                            setEditName(session.name);
                          }}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-1.5">
          {!sidebarOpen && (
            <button
              className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] py-1 pl-7 pr-2 text-xs text-[var(--text-primary)] outline-none focus:border-blue-300"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-40"
            onClick={handleExport}
            disabled={messages.length === 0}
            title="Copy as Markdown"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages */}
        {!currentSessionId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]">
            <MessageSquare className="h-10 w-10 text-[var(--text-tertiary)]" />
            <p>Create a session to start chatting</p>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              onClick={() => createSession()}
            >
              <Plus className="h-3.5 w-3.5" />
              New Session
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
              {filteredMessages.length === 0 && !streaming && (
                <div className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">
                  {searchQuery
                    ? "No matching messages"
                    : "Send a message to start the conversation"}
                </div>
              )}
              {filteredMessages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  searchQuery={searchQuery}
                />
              ))}
              {streaming && !streamingContent && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-tertiary)] [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-tertiary)] [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--text-tertiary)]" />
                    </span>
                  </div>
                </div>
              )}
              {streaming && streamingContent && (
                <ChatMessageBubble
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: streamingContent,
                    timestamp: new Date().toISOString(),
                  }}
                  isStreaming
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border-primary)] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  className="min-h-[36px] max-h-32 flex-1 resize-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                  placeholder="Type a message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={streaming}
                />
                {streaming ? (
                  <button
                    className="shrink-0 rounded-lg bg-red-600 p-2 text-white hover:bg-red-700"
                    onClick={stopResponse}
                    title="Stop response"
                  >
                    <StopCircle className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    className="shrink-0 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
