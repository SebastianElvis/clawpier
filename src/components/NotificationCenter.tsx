import { useState, useEffect, useRef } from "react";
import {
  Bell,
  BellOff,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
} from "lucide-react";
import { useNotificationStore, type Notification } from "../stores/notification-store";

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_CONFIG = {
  error: {
    icon: AlertTriangle,
    color: "var(--badge-red-text)",
    bg: "var(--badge-red-bg)",
  },
  warning: {
    icon: AlertCircle,
    color: "var(--badge-amber-text)",
    bg: "var(--badge-amber-bg)",
  },
  info: {
    icon: Info,
    color: "var(--badge-blue-text)",
    bg: "var(--badge-blue-bg)",
  },
  success: {
    icon: CheckCircle,
    color: "var(--badge-green-text)",
    bg: "var(--badge-green-bg)",
  },
} as const;

function NotificationItem({ notification }: { notification: Notification }) {
  const { markRead, removeNotification } = useNotificationStore();
  const config = TYPE_CONFIG[notification.type];
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.read) {
      markRead(notification.id);
    }
    if (notification.botId) {
      window.dispatchEvent(
        new CustomEvent("clawpier:navigate-bot", {
          detail: { botId: notification.botId },
        })
      );
    }
  };

  return (
    <div
      className={`group flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
        notification.botId ? "cursor-pointer" : ""
      } hover:bg-[var(--bg-hover)]`}
      onClick={handleClick}
    >
      {/* Unread indicator */}
      <div className="mt-1.5 flex w-2 shrink-0 items-center justify-center">
        {!notification.read && (
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Type icon */}
      <div
        className="mt-0.5 shrink-0 rounded-md p-1"
        style={{ backgroundColor: config.bg }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs leading-snug ${
            notification.read
              ? "text-[var(--text-secondary)]"
              : "font-medium text-[var(--text-primary)]"
          }`}
        >
          {notification.title}
        </p>
        {notification.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-tertiary)]">
            {notification.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
          {notification.botName && (
            <span className="rounded bg-[var(--bg-hover)] px-1 py-0.5 font-medium">
              {notification.botName}
            </span>
          )}
          <span>{formatRelativeTime(notification.timestamp)}</span>
        </div>
      </div>

      {/* Remove button */}
      <button
        className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)] group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          removeNotification(notification.id);
        }}
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAllRead, clearAll } =
    useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Force re-render every 30s to keep relative times fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        className="relative rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell className="h-3.5 w-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-3 py-2.5">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  className="rounded px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="rounded px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  onClick={clearAll}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          {notifications.length > 0 ? (
            <div className="max-h-[400px] divide-y divide-[var(--border-primary)] overflow-y-auto">
              {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-[var(--text-tertiary)]">
              <BellOff className="h-6 w-6" />
              <p className="text-xs">No notifications</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
