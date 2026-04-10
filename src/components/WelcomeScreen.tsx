import { Bot, Shield, Box } from "lucide-react";
import { FocusTrap } from "./FocusTrap";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <FocusTrap>
      <div className="w-full max-w-lg rounded-xl bg-[var(--bg-elevated)] p-8 shadow-2xl ring-1 ring-[var(--border-secondary)]">
        <div className="flex justify-center">
          <div className="rounded-2xl bg-[var(--badge-blue-bg)] p-4">
            <Bot className="h-10 w-10 text-[var(--accent-text)]" />
          </div>
        </div>

        <h1 className="mt-5 text-center text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Welcome to ClawPier
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
          Manage sandboxed OpenClaw bot instances from a single dashboard —
          without touching the terminal.
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-[var(--bg-primary)] p-3">
            <Box className="mt-0.5 h-5 w-5 text-[var(--accent-text)] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Docker-powered isolation
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Each bot runs in its own Docker container using the official
                OpenClaw image.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[var(--bg-primary)] p-3">
            <Shield className="mt-0.5 h-5 w-5 text-[var(--badge-green-text)] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Sandbox-safe by default
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Network access is disabled by default. The gateway binds to
                localhost only.
              </p>
            </div>
          </div>
        </div>

        <button
          className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          onClick={onDismiss}
        >
          Get Started
        </button>
        <button
          className="mt-2 w-full text-center text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          onClick={onDismiss}
        >
          Skip
        </button>
      </div>
      </FocusTrap>
    </div>
  );
}
