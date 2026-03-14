import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  ChatMessage,
  ChatResponseChunk,
  ChatSessionSummary,
} from "../lib/types";
import * as api from "../lib/tauri";

export function useChat(botId: string, isRunning: boolean) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loading, setLoading] = useState(false);
  const streamingRef = useRef("");
  const currentSessionRef = useRef<string | null>(null);
  currentSessionRef.current = currentSessionId;

  // Load sessions on mount / when bot changes
  useEffect(() => {
    if (!isRunning) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await api.listChatSessions(botId);
        if (cancelled) return;
        setSessions(result);
        if (result.length > 0 && !currentSessionRef.current) {
          const firstId = result[0].id;
          setCurrentSessionId(firstId);
          setLoading(true);
          const msgs = await api.getChatMessages(botId, firstId);
          if (!cancelled) {
            setMessages(msgs);
            setLoading(false);
          }
        }
      } catch (e) {
        console.error("Failed to load chat sessions:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [botId, isRunning]);

  // Listen for chat response events
  useEffect(() => {
    const unlisten = listen<ChatResponseChunk>(
      `chat-response-${botId}`,
      (event) => {
        const chunk = event.payload;
        if (chunk.done) {
          setStreaming(false);
          if (streamingRef.current.trim()) {
            const assistantMsg: ChatMessage = {
              id: Date.now().toString(),
              role: "assistant",
              content: streamingRef.current.trim(),
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          streamingRef.current = "";
          setStreamingContent("");
        } else {
          streamingRef.current += chunk.content;
          setStreamingContent(streamingRef.current);
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [botId]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      setCurrentSessionId(sessionId);
      setLoading(true);
      try {
        const msgs = await api.getChatMessages(botId, sessionId);
        setMessages(msgs);
      } catch (e) {
        console.error("Failed to load messages:", e);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    },
    [botId]
  );

  const createSession = useCallback(
    async (name?: string) => {
      const session = await api.createChatSession(
        botId,
        name || `Chat ${sessions.length + 1}`
      );
      setSessions((prev) => [session, ...prev]);
      setCurrentSessionId(session.id);
      setMessages([]);
      return session;
    },
    [botId, sessions.length]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await api.deleteChatSession(botId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionRef.current === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    },
    [botId]
  );

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      await api.renameChatSession(botId, sessionId, name);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
      );
    },
    [botId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!currentSessionRef.current || !text.trim() || streaming) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      streamingRef.current = "";
      setStreamingContent("");

      try {
        await api.sendChatMessage(botId, currentSessionRef.current, text.trim());
      } catch (e) {
        console.error("Failed to send message:", e);
        setStreaming(false);
      }
    },
    [botId, streaming]
  );

  const stopResponse = useCallback(async () => {
    try {
      await api.stopChatResponse(botId);
    } catch (e) {
      console.error("Failed to stop response:", e);
    }
    setStreaming(false);
  }, [botId]);

  return {
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
  };
}
