import { useState } from "react";
import { Copy, Check } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../lib/types";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  searchQuery?: string;
}

export function ChatMessageBubble({
  message,
  isStreaming,
  searchQuery,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Highlight search matches in content
  const content =
    searchQuery && !isUser
      ? message.content
      : message.content;

  return (
    <div
      className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`relative max-w-[85%] rounded-xl px-3 py-2 ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
        }`}
      >
        {/* Copy button */}
        <button
          className={`absolute -top-2 ${isUser ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} hidden rounded-md border border-[var(--border-primary)] bg-[var(--bg-elevated)] p-1 shadow-sm group-hover:block`}
          onClick={handleCopy}
          title="Copy message"
        >
          {copied ? (
            <Check className="h-3 w-3 text-[var(--badge-green-text)]" />
          ) : (
            <Copy className="h-3 w-3 text-[var(--text-tertiary)]" />
          )}
        </button>

        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-sm text-[var(--text-primary)] prose-headings:text-[var(--text-primary)] prose-strong:text-[var(--text-primary)] prose-a:text-[var(--badge-blue-text)] prose-p:my-1 prose-pre:my-2 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:rounded prose-code:bg-[var(--bg-hover)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:text-[var(--text-primary)] prose-code:before:content-none prose-code:after:content-none prose-pre:prose-code:bg-transparent prose-pre:prose-code:text-gray-100 prose-pre:prose-code:p-0 prose-li:text-[var(--text-primary)] prose-th:text-[var(--text-primary)] prose-td:text-[var(--text-secondary)] prose-hr:border-[var(--border-primary)]">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        )}

        {isStreaming && (
          <span className="mt-1 inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-tertiary)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-tertiary)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-tertiary)]" />
          </span>
        )}

        {/* Timestamp */}
        <p
          className={`mt-1 text-[10px] ${
            isUser ? "text-blue-200" : "text-[var(--text-tertiary)]"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
