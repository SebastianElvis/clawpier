import { useEffect, useState, useCallback } from "react";
import { useBotStore } from "./stores/bot-store";
import { useBotEvents } from "./hooks/use-bot-events";
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
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem(WELCOME_KEY)
  );

  // Subscribe to real-time status updates
  useBotEvents();

  // Zoom in/out with Cmd+=/Cmd+-/Cmd+0
  useZoom();

  // Initial check on mount: Docker → Image → fetch bots
  useEffect(() => {
    const init = async () => {
      const dockerOk = await checkDocker();
      if (dockerOk) {
        const imageOk = await checkImage();
        if (imageOk) {
          await fetchBots();
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
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
    setSelectedBotId(null);
  }

  return (
    <>
      <ErrorBoundary fallbackTitle="ClawPier encountered an error">
        {selectedBot ? (
          <div className="fixed inset-0 flex flex-col overflow-hidden bg-white">
            <DockerConnectionBanner />
            <ErrorBoundary
              fallbackTitle="Bot detail view error"
              onReset={() => setSelectedBotId(null)}
            >
              <BotDetail
                bot={selectedBot}
                onBack={() => setSelectedBotId(null)}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <Layout onCreateBot={() => setShowNewBot(true)} botCount={bots.length}>
            <DockerConnectionBanner />
            <BotList
              onCreateBot={() => setShowNewBot(true)}
              onSelectBot={setSelectedBotId}
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
