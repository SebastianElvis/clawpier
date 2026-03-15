import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useChat } from "../use-chat";

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: listen returns an unlisten function
  mockedListen.mockReturnValue(Promise.resolve(() => {}));
});

describe("useChat", () => {
  describe("session loading", () => {
    it("loads sessions when bot is running", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Chat 1",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 2,
        },
      ];
      const messages = [
        {
          id: "m1",
          role: "user",
          content: "Hello",
          timestamp: "2024-01-15T00:00:00Z",
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce(messages); // get_chat_messages

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual(sessions);
      });

      await vi.waitFor(() => {
        expect(result.current.messages).toEqual(messages);
        expect(result.current.currentSessionId).toBe("s1");
      });
    });

    it("does not load sessions when bot is not running", () => {
      renderHook(() => useChat("bot-1", false));

      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("handles empty session list", async () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions — empty

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual([]);
      });
      expect(result.current.currentSessionId).toBeNull();
    });
  });

  describe("createSession", () => {
    it("creates a session with a name", async () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions
      const newSession = {
        id: "s-new",
        name: "My Chat",
        created_at: "2024-01-15T00:00:00Z",
        message_count: 0,
      };
      mockedInvoke.mockResolvedValueOnce(newSession); // create_chat_session

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual([]);
      });

      await act(async () => {
        await result.current.createSession("My Chat");
      });

      expect(mockedInvoke).toHaveBeenCalledWith("create_chat_session", {
        id: "bot-1",
        name: "My Chat",
      });
      expect(result.current.sessions).toEqual([newSession]);
      expect(result.current.currentSessionId).toBe("s-new");
      expect(result.current.messages).toEqual([]);
    });

    it("creates session with default name if none provided", async () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions
      const newSession = {
        id: "s-new",
        name: "Chat 1",
        created_at: "2024-01-15T00:00:00Z",
        message_count: 0,
      };
      mockedInvoke.mockResolvedValueOnce(newSession); // create_chat_session

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual([]);
      });

      await act(async () => {
        await result.current.createSession();
      });

      expect(mockedInvoke).toHaveBeenCalledWith("create_chat_session", {
        id: "bot-1",
        name: "Chat 1",
      });
    });
  });

  describe("selectSession", () => {
    it("loads messages for selected session", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Chat 1",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 0,
        },
        {
          id: "s2",
          name: "Chat 2",
          created_at: "2024-01-15T00:01:00Z",
          message_count: 1,
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce([]); // get_chat_messages for s1

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual(sessions);
      });

      const s2Messages = [
        {
          id: "m2",
          role: "user",
          content: "Hi",
          timestamp: "2024-01-15T00:01:00Z",
        },
      ];
      mockedInvoke.mockResolvedValueOnce(s2Messages); // get_chat_messages for s2

      await act(async () => {
        await result.current.selectSession("s2");
      });

      expect(result.current.currentSessionId).toBe("s2");
      expect(result.current.messages).toEqual(s2Messages);
    });
  });

  describe("deleteSession", () => {
    it("removes session from list", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Chat 1",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 0,
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce([]); // get_chat_messages

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.currentSessionId).toBe("s1");
      });

      mockedInvoke.mockResolvedValueOnce(undefined); // delete_chat_session

      await act(async () => {
        await result.current.deleteSession("s1");
      });

      expect(mockedInvoke).toHaveBeenCalledWith("delete_chat_session", {
        id: "bot-1",
        sessionId: "s1",
      });
      expect(result.current.sessions).toEqual([]);
      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.messages).toEqual([]);
    });
  });

  describe("renameSession", () => {
    it("renames session in list", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Old Name",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 0,
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce([]); // get_chat_messages

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions[0]?.name).toBe("Old Name");
      });

      mockedInvoke.mockResolvedValueOnce(undefined); // rename_chat_session

      await act(async () => {
        await result.current.renameSession("s1", "New Name");
      });

      expect(mockedInvoke).toHaveBeenCalledWith("rename_chat_session", {
        id: "bot-1",
        sessionId: "s1",
        name: "New Name",
      });
      expect(result.current.sessions[0].name).toBe("New Name");
    });
  });

  describe("sendMessage", () => {
    it("does not send when no session selected", async () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions — empty

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual([]);
      });

      await act(async () => {
        await result.current.sendMessage("hello");
      });

      // Should not have called send_chat_message
      expect(mockedInvoke).not.toHaveBeenCalledWith(
        "send_chat_message",
        expect.anything()
      );
    });

    it("does not send empty messages", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Chat",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 0,
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce([]); // get_chat_messages

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.currentSessionId).toBe("s1");
      });

      await act(async () => {
        await result.current.sendMessage("   ");
      });

      expect(mockedInvoke).not.toHaveBeenCalledWith(
        "send_chat_message",
        expect.anything()
      );
    });

    it("sends message and adds user message optimistically", async () => {
      const sessions = [
        {
          id: "s1",
          name: "Chat",
          created_at: "2024-01-15T00:00:00Z",
          message_count: 0,
        },
      ];
      mockedInvoke.mockResolvedValueOnce(sessions); // list_chat_sessions
      mockedInvoke.mockResolvedValueOnce([]); // get_chat_messages

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.currentSessionId).toBe("s1");
      });

      mockedInvoke.mockResolvedValueOnce(undefined); // send_chat_message

      await act(async () => {
        await result.current.sendMessage("Hello bot");
      });

      expect(mockedInvoke).toHaveBeenCalledWith("send_chat_message", {
        id: "bot-1",
        sessionId: "s1",
        message: "Hello bot",
      });

      // User message should be added optimistically
      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[0].content).toBe("Hello bot");
      expect(result.current.streaming).toBe(true);
    });
  });

  describe("stopResponse", () => {
    it("calls stop_chat_response", async () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions

      const { result } = renderHook(() => useChat("bot-1", true));

      await vi.waitFor(() => {
        expect(result.current.sessions).toEqual([]);
      });

      mockedInvoke.mockResolvedValueOnce(undefined); // stop_chat_response

      await act(async () => {
        await result.current.stopResponse();
      });

      expect(mockedInvoke).toHaveBeenCalledWith("stop_chat_response", {
        id: "bot-1",
      });
      expect(result.current.streaming).toBe(false);
    });
  });

  describe("event listener", () => {
    it("subscribes to chat-response events", () => {
      mockedInvoke.mockResolvedValueOnce([]); // list_chat_sessions

      renderHook(() => useChat("bot-1", true));

      expect(mockedListen).toHaveBeenCalledWith(
        "chat-response-bot-1",
        expect.any(Function)
      );
    });
  });
});
