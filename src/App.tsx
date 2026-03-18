import { useEffect, useState, useCallback, useRef } from "react";
import { useBotStore } from "./stores/bot-store";
import { useToastStore } from "./stores/toast-store";
import { autoStartBots } from "./lib/tauri";
import { useBotEvents } from "./hooks/use-bot-events";
import { useStatusNotifications } from "./hooks/use-status-notifications";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { useZoom } from "./hooks/use-zoom";
import { Layout } from "./components/Layout";
import { BotList } from "./components/BotList";
import { BotDetail } from "./components/BotDetail";
import { NewBotSheet } from "./components/NewBotSheet";
import { DockerError } from "./components/DockerError";
import { ImageMissing } from "./components/ImageMissing";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DockerConnectionBanner } from "./components/DockerConnectionBanner";
import { loadWindowState, saveWindowState } from "./lib/window-state";

const WELCOME_KEY = "clawpier-welcome-dismissed";

function App() {
  const {
    dockerAvailable,
    imageAvailable,
    checkDocker,
    checkImage,
    fetchBots,
    bots,
  } = useBotStore();
  const [showNewBot, setShowNewBot] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(
    () => loadWindowState().selectedBotId ?? null
  );
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem(WELCOME_KEY)
  );

  const selectBot = useCallback((id: string | null) => {
    setSelectedBotId(id);
    saveWindowState({ selectedBotId: id ?? undefined });
  }, []);

  // Subscribe to real-time status updates
  useBotEvents();

  // Subscribe to status transition notifications (crash/stop alerts)
  useStatusNotifications();

  // Zoom in/out with Cmd+=/Cmd+-/Cmd+0
  useZoom();

  // Tab change callback ref — BotDetail registers its setActiveTab here
  const tabChangeRef = useRef<((tab: string) => void) | null>(null);

  const handleTabChange = useCallback((tab: string) => {
    tabChangeRef.current?.(tab);
  }, []);

  // Find selected bot for keyboard shortcuts
  const selectedBotForShortcuts = selectedBotId
    ? bots.find((b) => b.id === selectedBotId)
    : null;

  const { startBot, stopBot, restartBot, actionInProgress } = useBotStore();

  // Keyboard shortcuts for bot detail navigation and actions
  useKeyboardShortcuts({
    selectedBotId,
    isRunning: selectedBotForShortcuts?.status.type === "Running",
    isLoading: selectedBotId ? actionInProgress.has(selectedBotId) : false,
    onBack: useCallback(() => selectBot(null), [selectBot]),
    onTabChange: handleTabChange,
    onStartBot: useCallback(() => {
      if (selectedBotId) startBot(selectedBotId);
    }, [selectedBotId, startBot]),
    onStopBot: useCallback(() => {
      if (selectedBotId) stopBot(selectedBotId);
    }, [selectedBotId, stopBot]),
    onRestartBot: useCallback(() => {
      if (selectedBotId) restartBot(selectedBotId);
    }, [selectedBotId, restartBot]),
  });

  // Initial check on mount: Docker → Image → fetch bots → auto-start
  useEffect(() => {
    const toast = useToastStore.getState().addToast;
    const init = async () => {
      const dockerOk = await checkDocker();
      if (dockerOk) {
        const imageOk = await checkImage();
        if (imageOk) {
          await fetchBots();
          // Auto-start bots configured with auto_start: true
          autoStartBots().then((errors) => {
            if (errors.length > 0) {
              for (const err of errors) {
                toast({
                  type: "error",
                  title: "Auto-start failed",
                  description: err,
                });
              }
            }
            // Refresh bot list to reflect newly started bots
            fetchBots();
          });
        }
      }
    };
    init();
  }, [checkDocker, checkImage, fetchBots]);

  // When image becomes available (e.g. after pull), fetch bots
  useEffect(() => {
    if (dockerAvailable && imageAvailable) {
      fetchBots();
    }
  }, [dockerAvailable, imageAvailable, fetchBots]);

  const handleDismissWelcome = useCallback(() => {
    localStorage.setItem(WELCOME_KEY, "true");
    setShowWelcome(false);
  }, []);

  // Keyboard shortcut: Cmd+N to create bot
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        if (dockerAvailable && imageAvailable) {
          setShowNewBot(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dockerAvailable, imageAvailable]);

  // Loading initial state
  if (dockerAvailable === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-primary)] border-t-blue-600" />
      </div>
    );
  }

  // Docker not available
  if (dockerAvailable === false) {
    return <DockerError />;
  }

  // Docker is available but image check still in progress
  if (imageAvailable === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-primary)] border-t-blue-600" />
      </div>
    );
  }

  // Image not found — prompt user to pull
  if (imageAvailable === false) {
    return <ImageMissing />;
  }

  // Find selected bot for detail view
  const selectedBot = selectedBotId
    ? bots.find((b) => b.id === selectedBotId)
    : null;

  // If selected bot was deleted, go back to list
  if (selectedBotId && !selectedBot) {
    selectBot(null);
  }

  return (
    <>
      <ErrorBoundary fallbackTitle="ClawPier encountered an error">
        {selectedBot ? (
          <div className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--bg-surface)]">
            <DockerConnectionBanner />
            <ErrorBoundary
              fallbackTitle="Bot detail view error"
              onReset={() => selectBot(null)}
            >
              <BotDetail
                bot={selectedBot}
                onBack={() => selectBot(null)}
                tabChangeRef={tabChangeRef}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <Layout onCreateBot={() => setShowNewBot(true)} botCount={bots.length}>
            <DockerConnectionBanner />
            <BotList
              onCreateBot={() => setShowNewBot(true)}
              onSelectBot={selectBot}
            />
          </Layout>
        )}

        {showNewBot && <NewBotSheet onClose={() => setShowNewBot(false)} />}
        {showWelcome && <WelcomeScreen onDismiss={handleDismissWelcome} />}
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
}

export default App;
