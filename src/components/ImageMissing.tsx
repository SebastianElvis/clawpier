import { useState, useEffect } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useBotStore, DEFAULT_IMAGE, HERMES_IMAGE } from "../stores/bot-store";
import * as api from "../lib/tauri";

interface ImageStatus {
  image: string;
  label: string;
  available: boolean | null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ImageMissing() {
  const { pullImage, checkImage, pullProgress, pullingImage } = useBotStore();
  const [images, setImages] = useState<ImageStatus[]>([
    { image: DEFAULT_IMAGE, label: "OpenClaw", available: null },
    { image: HERMES_IMAGE, label: "Hermes", available: null },
  ]);
  const [pulling, setPulling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check which images are available on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.checkImage(DEFAULT_IMAGE).catch(() => false),
      api.checkImage(HERMES_IMAGE).catch(() => false),
    ]).then(([ocOk, hOk]) => {
      if (cancelled) return;
      setImages([
        { image: DEFAULT_IMAGE, label: "OpenClaw", available: ocOk },
        { image: HERMES_IMAGE, label: "Hermes", available: hOk },
      ]);
    });
    return () => { cancelled = true; };
  }, []);

  const handlePull = async (image: string) => {
    setPulling(image);
    setError(null);
    try {
      await pullImage(image);
      setImages((prev) =>
        prev.map((img) =>
          img.image === image ? { ...img, available: true } : img
        )
      );
      // If any image is now available, re-check to let the app proceed
      setTimeout(() => checkImage(), 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to pull image. Check your internet connection."
      );
    } finally {
      setPulling(null);
    }
  };

  const anyAvailable = images.some((img) => img.available === true);
  const progressPercent =
    pullProgress && pullProgress.bytes_total > 0
      ? Math.round((pullProgress.bytes_downloaded / pullProgress.bytes_total) * 100)
      : null;

  return (
    <div className="flex h-screen flex-col items-center justify-center px-6">
      <div className="rounded-2xl bg-[var(--badge-amber-bg)] p-5">
        <Download className="h-12 w-12 text-[var(--badge-amber-text)]" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        Agent Image Not Found
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-[var(--text-secondary)]">
        ClawPier needs at least one agent Docker image to run bot instances.
        Pull the image for the agent you want to use.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--badge-red-bg)] px-4 py-3 text-sm text-[var(--badge-red-text)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 w-full max-w-sm">
        {images.map((img) => (
          <div
            key={img.image}
            className="overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{img.label}</p>
                <p className="truncate text-xs text-[var(--text-tertiary)] font-mono">{img.image}</p>
              </div>
              <div className="ml-3 shrink-0">
                {img.available === true ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--badge-green-text)]">
                    <CheckCircle2 className="h-4 w-4" />
                    Ready
                  </span>
                ) : (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    onClick={() => handlePull(img.image)}
                    disabled={pulling !== null}
                  >
                    {pulling === img.image ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Pull
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar for the image currently being pulled */}
            {pullingImage === img.image && pullProgress && (
              <div className="px-4 pb-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border-primary)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                    style={{
                      width: progressPercent !== null ? `${progressPercent}%` : "100%",
                      animation: progressPercent === null ? "pulse 2s ease-in-out infinite" : undefined,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                  <span>
                    {pullProgress.layers_done}/{pullProgress.layers_total} layers
                    {pullProgress.bytes_total > 0 && (
                      <> &middot; {formatBytes(pullProgress.bytes_downloaded)} / {formatBytes(pullProgress.bytes_total)}</>
                    )}
                  </span>
                  {progressPercent !== null && <span>{progressPercent}%</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {pulling && !pullProgress && (
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          This may take a few minutes depending on your connection.
        </p>
      )}

      {anyAvailable && (
        <button
          className="mt-4 rounded-lg bg-[var(--btn-start-bg)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--btn-start-hover)]"
          onClick={() => checkImage()}
        >
          Continue
        </button>
      )}
    </div>
  );
}
