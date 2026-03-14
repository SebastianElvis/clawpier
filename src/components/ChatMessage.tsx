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
            : "border border-gray-200 bg-white text-gray-800"
        }`}
      >
        {/* Copy button */}
        <button
          className={`absolute -top-2 ${isUser ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} hidden rounded-md border border-gray-200 bg-white p-1 shadow-sm group-hover:block`}
          onClick={handleCopy}
          title="Copy message"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3 text-gray-400" />
          )}
        </button>

        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-sm prose-p:my-1 prose-pre:my-2 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:text-gray-800 prose-code:before:content-none prose-code:after:content-none prose-pre:prose-code:bg-transparent prose-pre:prose-code:text-gray-100 prose-pre:prose-code:p-0">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        )}

        {isStreaming && (
          <span className="mt-1 inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
          </span>
        )}

        {/* Timestamp */}
        <p
          className={`mt-1 text-[10px] ${
            isUser ? "text-blue-200" : "text-gray-400"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
