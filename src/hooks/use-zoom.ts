import { useEffect, useState, useCallback } from "react";

const ZOOM_KEY = "clawbox-zoom-level";
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.6;
const STEP = 0.1;
const DEFAULT_ZOOM = 1.0;

function getStoredZoom(): number {
  const stored = localStorage.getItem(ZOOM_KEY);
  if (stored) {
    const val = parseFloat(stored);
    if (!isNaN(val) && val >= MIN_ZOOM && val <= MAX_ZOOM) return val;
  }
  return DEFAULT_ZOOM;
}

function applyZoom(level: number) {
  document.documentElement.style.zoom = String(level);
}

export function useZoom() {
  const [zoom, setZoom] = useState(getStoredZoom);

  const updateZoom = useCallback((level: number) => {
    const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) * 10) / 10;
    setZoom(clamped);
    applyZoom(clamped);
    localStorage.setItem(ZOOM_KEY, String(clamped));
  }, []);

  // Apply stored zoom on mount
  useEffect(() => {
    applyZoom(zoom);
  }, [zoom]);

  // Keyboard shortcuts: Cmd+= (zoom in), Cmd+- (zoom out), Cmd+0 (reset)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((prev) => {
          const next = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + STEP)) * 10) / 10;
          applyZoom(next);
          localStorage.setItem(ZOOM_KEY, String(next));
          return next;
        });
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((prev) => {
          const next = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev - STEP)) * 10) / 10;
          applyZoom(next);
          localStorage.setItem(ZOOM_KEY, String(next));
          return next;
        });
      } else if (e.key === "0") {
        e.preventDefault();
        updateZoom(DEFAULT_ZOOM);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [updateZoom]);

  return { zoom, zoomIn: () => updateZoom(zoom + STEP), zoomOut: () => updateZoom(zoom - STEP), resetZoom: () => updateZoom(DEFAULT_ZOOM) };
}
