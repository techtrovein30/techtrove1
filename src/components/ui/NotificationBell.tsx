import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, RefreshCcw, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
} from "../../lib/notifications";
import type { Notification } from "../../lib/notifications";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function notificationIcon(type: string) {
  if (type === "reupload_requested") return <RefreshCcw className="h-3.5 w-3.5 text-amber-400" />;
  return <Bell className="h-3.5 w-3.5 text-primary-soft" />;
}

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Fetch unread count on mount
  useEffect(() => {
    getUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  // Subscribe to realtime notifications
  useEffect(() => {
    const unsubscribe = subscribeToNotifications(userId, (newNotification) => {
      setNotifications((prev) => [newNotification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });
    return unsubscribe;
  }, [userId]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [notifs, count] = await Promise.all([
        getUserNotifications(),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  function handleToggle() {
    if (!open) {
      loadNotifications();
    }
    setOpen(!open);
  }

  async function handleMarkRead(notification: Notification) {
    if (notification.read) return;
    await markNotificationRead(notification.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function handleNotificationClick(notification: Notification) {
    handleMarkRead(notification);
    setOpen(false);
    // Navigate to profile page where they can see registrations
    navigate("/profile");
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-muted transition-all duration-200 hover:border-primary/40 hover:text-primary-soft hover:bg-primary/5"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-in zoom-in duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/[0.08] bg-[#161616] shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200 sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-soft transition-colors hover:text-primary"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Close notifications"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Bell className="h-8 w-8 text-white/[0.06]" />
                <p className="mt-3 text-sm font-medium text-foreground">All caught up!</p>
                <p className="mt-1 text-xs text-muted">No notifications to show.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${
                        !notification.read ? "bg-primary/[0.03]" : ""
                      }`}
                    >
                      {/* Icon */}
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        notification.type === "reupload_requested"
                          ? "bg-amber-500/10"
                          : "bg-primary/10"
                      }`}>
                        {notificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${
                          notification.read ? "text-muted" : "text-foreground"
                        }`}>
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted/60">
                          {timeAgo(notification.createdAt)}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!notification.read && (
                        <div className="mt-2 flex shrink-0 items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_rgba(124,58,237,0.6)]" />
                        </div>
                      )}
                      {notification.read && (
                        <Check className="mt-2 h-3 w-3 shrink-0 text-muted/40" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-white/[0.07] px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/profile");
                }}
                className="w-full text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft transition-colors hover:text-primary py-1"
              >
                View profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
