import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  startTerminalSession,
  writeTerminalInput,
  resizeTerminal,
} from "../lib/tauri";

import "@xterm/xterm/css/xterm.css";

interface UseInteractiveTerminalOptions {
  botId: string;
  isRunning: boolean;
}

export function useInteractiveTerminal({
  botId,
  isRunning,
}: UseInteractiveTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Write a command to the terminal (used by quick command chips)
  const writeCommand = useCallback(
    (command: string) => {
      if (isConnected) {
        writeTerminalInput(botId, command + "\n").catch(console.error);
      }
    },
    [botId, isConnected]
  );

  useEffect(() => {
    if (!isRunning || !containerRef.current) return;

    const container = containerRef.current;

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#030712", // gray-950
        foreground: "#e5e7eb", // gray-200
        cursor: "#60a5fa", // blue-400
        selectionBackground: "#374151", // gray-700
        black: "#1f2937",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e5e7eb",
        brightBlack: "#6b7280",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#f9fafb",
      },
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Open terminal in the container div
    term.open(container);

    // Fit to container size
    try {
      fitAddon.fit();
    } catch {
      // Container might not have dimensions yet
    }

    // Start the interactive session
    setIsConnecting(true);

    const cols = term.cols;
    const rows = term.rows;

    let cancelled = false;

    (async () => {
      try {
        // Listen for output events from the backend
        const unlisten = await listen<string>(
          `terminal-output-${botId}`,
          (event) => {
            if (!cancelled) {
              term.write(event.payload);
            }
          }
        );
        unlistenRef.current = unlisten;

        // Start the backend terminal session
        await startTerminalSession(botId, cols, rows);

        if (!cancelled) {
          setIsConnected(true);
          setIsConnecting(false);
        }
      } catch (err) {
        console.error("Failed to start terminal session:", err);
        if (!cancelled) {
          setIsConnecting(false);
          term.write(
            "\r\n\x1b[31mFailed to connect to container terminal.\x1b[0m\r\n"
          );
        }
      }
    })();

    // Forward user input to the backend
    const inputDisposable = term.onData((data) => {
      writeTerminalInput(botId, data).catch(console.error);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        resizeTerminal(botId, term.cols, term.rows).catch(() => {
          // Ignore resize errors (session may not be ready yet)
        });
      } catch {
        // Ignore fit errors
      }
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    // Cleanup
    return () => {
      cancelled = true;
      inputDisposable.dispose();
      resizeObserver.disconnect();
      resizeObserverRef.current = null;

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;

      setIsConnected(false);
      setIsConnecting(false);
    };
  }, [botId, isRunning]);

  return { containerRef, isConnected, isConnecting, writeCommand };
}
