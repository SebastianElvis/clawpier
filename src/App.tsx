import { useEffect, useState, useCallback } from "react";
import { useBotStore } from "./stores/bot-store";
import { useBotEvents } from "./hooks/use-bot-events";
import { Layout } from "./components/Layout";
import { BotList } from "./components/BotList";
import { NewBotSheet } from "./components/NewBotSheet";
import { DockerError } from "./components/DockerError";
import { WelcomeScreen } from "./components/WelcomeScreen";

const WELCOME_KEY = "clawbox-welcome-dismissed";

function App() {
  const { dockerAvailable, checkDocker, fetchBots, bots } = useBotStore();
  const [showNewBot, setShowNewBot] = useState(false);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem(WELCOME_KEY)
  );

  // Subscribe to real-time status updates
  useBotEvents();

  // Initial check on mount
  useEffect(() => {
    const init = async () => {
      const available = await checkDocker();
      if (available) {
        await fetchBots();
      }
    };
    init();
  }, [checkDocker, fetchBots]);

  // Re-fetch bots when Docker becomes available
  useEffect(() => {
    if (dockerAvailable) {
      fetchBots();
    }
  }, [dockerAvailable, fetchBots]);

  const handleDismissWelcome = useCallback(() => {
    localStorage.setItem(WELCOME_KEY, "true");
    setShowWelcome(false);
  }, []);

  // Keyboard shortcut: Cmd+N to create bot
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        if (dockerAvailable) {
          setShowNewBot(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dockerAvailable]);

  // Docker not available
  if (dockerAvailable === false) {
    return <DockerError />;
  }

  // Loading initial state
  if (dockerAvailable === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <>
      <Layout onCreateBot={() => setShowNewBot(true)} botCount={bots.length}>
        <BotList onCreateBot={() => setShowNewBot(true)} />
      </Layout>

      {showNewBot && <NewBotSheet onClose={() => setShowNewBot(false)} />}
      {showWelcome && <WelcomeScreen onDismiss={handleDismissWelcome} />}
    </>
  );
}

export default App;
