import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNotificationStore } from "../notification-store";
import { useToastStore } from "../toast-store";

describe("notification-store", () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      preferences: {
        healthAlerts: true,
        statusAlerts: true,
        resourceAlerts: true,
        cpuThresholdPercent: 90,
        memoryThresholdPercent: 85,
      },
      unreadCount: 0,
    });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  it("adds a notification and increments unreadCount", () => {
    useNotificationStore.getState().addNotification({
      type: "error",
      category: "health",
      title: "Health check failing",
    });

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].title).toBe("Health check failing");
    expect(state.notifications[0].read).toBe(false);
    expect(state.unreadCount).toBe(1);
  });

  it("fires a toast when adding a notification", () => {
    useNotificationStore.getState().addNotification({
      type: "info",
      category: "system",
      title: "System update",
      description: "Something happened",
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("System update");
    expect(toasts[0].description).toBe("Something happened");
  });

  it("markRead marks a single notification as read", () => {
    useNotificationStore.getState().addNotification({
      type: "info",
      category: "system",
      title: "One",
    });
    useNotificationStore.getState().addNotification({
      type: "info",
      category: "system",
      title: "Two",
    });

    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markRead(id);

    const state = useNotificationStore.getState();
    expect(state.notifications.find((n) => n.id === id)?.read).toBe(true);
    expect(state.unreadCount).toBe(1);
  });

  it("markAllRead marks all notifications as read", () => {
    for (let i = 0; i < 5; i++) {
      useNotificationStore.getState().addNotification({
        type: "info",
        category: "system",
        title: `Notification ${i}`,
      });
    }
    expect(useNotificationStore.getState().unreadCount).toBe(5);

    useNotificationStore.getState().markAllRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });

  it("clearAll removes all notifications", () => {
    for (let i = 0; i < 3; i++) {
      useNotificationStore.getState().addNotification({
        type: "info",
        category: "system",
        title: `Notification ${i}`,
      });
    }

    useNotificationStore.getState().clearAll();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it("removeNotification removes a single notification", () => {
    useNotificationStore.getState().addNotification({
      type: "info",
      category: "system",
      title: "Keep",
    });
    useNotificationStore.getState().addNotification({
      type: "info",
      category: "system",
      title: "Remove",
    });

    const toRemove = useNotificationStore
      .getState()
      .notifications.find((n) => n.title === "Remove")!;
    useNotificationStore.getState().removeNotification(toRemove.id);

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].title).toBe("Keep");
  });

  it("caps at 200 entries, pruning oldest", () => {
    for (let i = 0; i < 210; i++) {
      useNotificationStore.getState().addNotification({
        type: "info",
        category: "system",
        title: `Notification ${i}`,
      });
    }

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(200);
    // Newest should be first (prepended)
    expect(state.notifications[0].title).toBe("Notification 209");
  });

  it("updatePreferences merges partial preferences", () => {
    useNotificationStore.getState().updatePreferences({
      cpuThresholdPercent: 80,
      healthAlerts: false,
    });

    const prefs = useNotificationStore.getState().preferences;
    expect(prefs.cpuThresholdPercent).toBe(80);
    expect(prefs.healthAlerts).toBe(false);
    // Other defaults unchanged
    expect(prefs.statusAlerts).toBe(true);
    expect(prefs.memoryThresholdPercent).toBe(85);
  });

  it("stores botId and botName on notifications", () => {
    useNotificationStore.getState().addNotification({
      type: "error",
      category: "health",
      title: "Bot crashed",
      botId: "abc-123",
      botName: "MyBot",
    });

    const n = useNotificationStore.getState().notifications[0];
    expect(n.botId).toBe("abc-123");
    expect(n.botName).toBe("MyBot");
  });
});
