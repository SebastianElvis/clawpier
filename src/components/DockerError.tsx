import { useState, useEffect, useCallback, useRef } from "react";
import { Container, Loader2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useBotStore } from "../stores/bot-store";

const AUTO_RETRY_INTERVAL = 10;

export function DockerError() {
  const checkDocker = useBotStore((s) => s.checkDocker);
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_RETRY_INTERVAL);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRetry = useCallback(async () => {
    setChecking(true);
    setCountdown(AUTO_RETRY_INTERVAL);
    await checkDocker();
    setChecking(false);
  }, [checkDocker]);

  // Auto-retry countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return AUTO_RETRY_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [handleRetry]);

  return (
    <div className="flex h-screen flex-col items-center justify-center px-6">
      <div className="rounded-2xl bg-[var(--badge-red-bg)] p-5">
        <Container className="h-12 w-12 text-[var(--badge-red-text)]" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        Docker Not Detected
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-[var(--text-secondary)]">
        ClawPier requires Docker Desktop to run sandboxed bot instances. Please
        make sure Docker Desktop is installed and running.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          onClick={handleRetry}
          disabled={checking}
        >
          {checking && <Loader2 className="h-4 w-4 animate-spin" />}
          Retry
        </button>
        <a
          href="https://www.docker.com/products/docker-desktop/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-primary)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <ExternalLink className="h-4 w-4" />
          Download Docker Desktop
        </a>
      </div>
      <p className="mt-3 text-xs text-[var(--text-tertiary)]">
        {checking ? "Checking..." : `Checking again in ${countdown}s...`}
      </p>

      {/* Collapsible troubleshooting */}
      <div className="mt-6 w-full max-w-md">
        <button
          className="flex w-full items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={() => setShowTroubleshoot(!showTroubleshoot)}
        >
          {showTroubleshoot ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Troubleshooting
        </button>
        {showTroubleshoot && (
          <div className="mt-2 space-y-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
            <p>1. Open Docker Desktop and ensure it shows "Docker is running".</p>
            <p>2. Try running <code className="rounded bg-[var(--bg-hover)] px-1 py-0.5 font-mono text-[10px]">docker ps</code> in your terminal to verify the daemon is responding.</p>
            <p>3. If Docker was just installed, you may need to restart your Mac.</p>
          </div>
        )}
      </div>
    </div>
  );
}
