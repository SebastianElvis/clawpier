import { Bot, Shield, Box } from "lucide-react";
import { FocusTrap } from "./FocusTrap";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <FocusTrap>
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <div className="rounded-2xl bg-blue-50 p-4">
            <Bot className="h-10 w-10 text-blue-600" />
          </div>
        </div>

        <h1 className="mt-5 text-center text-xl font-bold text-gray-900">
          Welcome to ClawPier
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Manage sandboxed OpenClaw bot instances from a single dashboard —
          without touching the terminal.
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
            <Box className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Docker-powered isolation
              </p>
              <p className="text-xs text-gray-500">
                Each bot runs in its own Docker container using the official
                OpenClaw image.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
            <Shield className="mt-0.5 h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Sandbox-safe by default
              </p>
              <p className="text-xs text-gray-500">
                Network access is disabled by default. The gateway binds to
                localhost only.
              </p>
            </div>
          </div>
        </div>

        <button
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          onClick={onDismiss}
        >
          Get Started
        </button>
      </div>
      </FocusTrap>
    </div>
  );
}
