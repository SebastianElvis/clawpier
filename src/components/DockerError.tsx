import { useState } from "react";
import { Container, Loader2, ExternalLink } from "lucide-react";
import { useBotStore } from "../stores/bot-store";

export function DockerError() {
  const checkDocker = useBotStore((s) => s.checkDocker);
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    await checkDocker();
    setChecking(false);
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center px-6">
      <div className="rounded-2xl bg-red-50 p-5">
        <Container className="h-12 w-12 text-red-400" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-gray-900">
        Docker Not Detected
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-gray-500">
        Clawbox requires Docker Desktop to run sandboxed bot instances. Please
        make sure Docker Desktop is installed and running.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <ExternalLink className="h-4 w-4" />
          Download Docker Desktop
        </a>
      </div>
    </div>
  );
}
