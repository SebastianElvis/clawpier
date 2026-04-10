import { useState } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useBotStore, DEFAULT_IMAGE } from "../stores/bot-store";

export function ImageMissing() {
  const { pullImage, checkImage } = useBotStore();
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handlePull = async () => {
    setPulling(true);
    setError(null);
    try {
      await pullImage();
      setDone(true);
      // Brief pause to show success, then re-check triggers App to proceed
      setTimeout(() => {
        checkImage();
      }, 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to pull image. Check your internet connection."
      );
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center px-6">
      <div className="rounded-2xl bg-[var(--badge-amber-bg)] p-5">
        <Download className="h-12 w-12 text-[var(--badge-amber-text)]" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        OpenClaw Image Not Found
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-[var(--text-secondary)]">
        ClawPier needs the OpenClaw Docker image to run bot instances. The image
        will be downloaded from the container registry.
      </p>
      <p className="mt-1.5 rounded bg-[var(--bg-hover)] px-3 py-1 font-mono text-xs text-[var(--text-secondary)]">
        {DEFAULT_IMAGE}
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6">
        {done ? (
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--badge-green-text)]">
            <CheckCircle2 className="h-5 w-5" />
            Image pulled successfully!
          </div>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
            onClick={handlePull}
            disabled={pulling}
          >
            {pulling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Pulling image...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Pull Image
              </>
            )}
          </button>
        )}
      </div>

      {pulling && (
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          This may take a few minutes depending on your connection.
        </p>
      )}
    </div>
  );
}
