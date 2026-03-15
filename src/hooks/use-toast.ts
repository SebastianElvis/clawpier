import { useToastStore } from "../stores/toast-store";

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  return {
    toast: {
      success: (title: string, description?: string) =>
        addToast({ type: "success", title, description }),
      error: (title: string, description?: string) =>
        addToast({ type: "error", title, description }),
      warning: (title: string, description?: string) =>
        addToast({ type: "warning", title, description }),
      info: (title: string, description?: string) =>
        addToast({ type: "info", title, description }),
    },
    dismiss: useToastStore((s) => s.dismissToast),
  };
}
