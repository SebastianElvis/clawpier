import { useToastStore, type ToastType } from "../stores/toast-store";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const icons: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastType, string> = {
  success: "border-[var(--badge-green-text)]/30 bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]",
  error: "border-[var(--badge-red-text)]/30 bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]",
  warning: "border-[var(--badge-amber-text)]/30 bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]",
  info: "border-[var(--badge-blue-text)]/30 bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`toast-enter flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${styles[toast.type]}`}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && (
                <p className="text-sm opacity-80 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
