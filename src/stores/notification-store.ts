import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useToastStore } from "./toast-store";

export interface Notification {
  id: string;
  type: "error" | "warning" | "info" | "success";
  category: "health" | "status" | "resource" | "system";
  title: string;
  description?: string;
  botId?: string;
  botName?: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationPreferences {
  healthAlerts: boolean;
  statusAlerts: boolean;
  resourceAlerts: boolean;
  cpuThresholdPercent: number;
  memoryThresholdPercent: number;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  healthAlerts: true,
  statusAlerts: true,
  resourceAlerts: true,
  cpuThresholdPercent: 90,
  memoryThresholdPercent: 85,
};

const MAX_NOTIFICATIONS = 200;

interface NotificationStore {
  notifications: Notification[];
  preferences: NotificationPreferences;
  unreadCount: number;

  addNotification: (
    n: Omit<Notification, "id" | "timestamp" | "read">
  ) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
  updatePreferences: (partial: Partial<NotificationPreferences>) => void;
}

function computeUnreadCount(notifications: Notification[]): number {
  return notifications.filter((n) => !n.read).length;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      notifications: [],
      preferences: { ...DEFAULT_PREFERENCES },
      unreadCount: 0,

      addNotification: (n) => {
        const notification: Notification = {
          ...n,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        // Fire ephemeral toast
        useToastStore.getState().addToast({
          type: n.type,
          title: n.title,
          description: n.description,
        });

        set((state) => {
          const updated = [notification, ...state.notifications].slice(
            0,
            MAX_NOTIFICATIONS
          );
          return {
            notifications: updated,
            unreadCount: computeUnreadCount(updated),
          };
        });
      },

      markRead: (id) =>
        set((state) => {
          const updated = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return {
            notifications: updated,
            unreadCount: computeUnreadCount(updated),
          };
        }),

      markAllRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),

      clearAll: () => set({ notifications: [], unreadCount: 0 }),

      removeNotification: (id) =>
        set((state) => {
          const updated = state.notifications.filter((n) => n.id !== id);
          return {
            notifications: updated,
            unreadCount: computeUnreadCount(updated),
          };
        }),

      updatePreferences: (partial) =>
        set((state) => ({
          preferences: { ...state.preferences, ...partial },
        })),
    }),
    {
      name: "clawpier-notifications",
      partialize: (state) => ({
        notifications: state.notifications,
        preferences: state.preferences,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<
          Pick<NotificationStore, "notifications" | "preferences">
        >;
        const notifications = data?.notifications ?? current.notifications;
        return {
          ...current,
          notifications,
          preferences: { ...DEFAULT_PREFERENCES, ...data?.preferences },
          unreadCount: computeUnreadCount(notifications),
        };
      },
    }
  )
);
