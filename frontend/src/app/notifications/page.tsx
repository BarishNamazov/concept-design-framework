"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { RequireAuth } from "@/components/forum/require-auth";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { useQuery } from "@/hooks/use-query";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Notification } from "@/lib/models";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function notificationMessage(n: Notification): string {
  switch (n.kind) {
    case "reply":
      return "New reply";
    case "mention":
      return "You were mentioned";
    case "accepted":
      return "Your answer was accepted";
    default:
      return n.kind;
  }
}

function Notifications() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{
    notifications: Notification[];
  }>(session ? () => api.notifications.list({ session }) : null, [session]);

  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((n) => !n.read).length;

  const [links, setLinks] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const resolveLinks = async () => {
      const resolved: Record<string, string | null> = {};
      await Promise.all(
        notifications
          .filter((n) => n.link)
          .map(async (n) => {
            const postId = String(n.link);
            try {
              const result = await api.threads.forItem({ item: postId });
              if (isApiError(result)) return;
              resolved[String(n.notification)] = result.conversation
                ? `/t/${result.conversation}#post-${postId}`
                : null;
            } catch {
              // link unresolvable; skip silently
            }
          }),
      );
      setLinks(resolved);
    };
    if (notifications.length > 0) resolveLinks();
  }, [data]);

  async function markRead(notification: string) {
    if (!session) return;
    await api.notifications.markRead({ session, notification });
    refetch();
  }

  async function dismiss(notification: string) {
    if (!session) return;
    await api.notifications.dismiss({ session, notification });
    refetch();
  }

  async function markAll() {
    if (!session) return;
    const result = await api.notifications.markAllRead({ session });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("All caught up");
      refetch();
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        description="Replies, mentions, and updates on topics you follow."
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAll} className="gap-2">
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="When something happens, you'll hear about it here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const id = String(n.notification);
            const body = (
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">
                      {notificationMessage(n)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
            );
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors",
                  n.read
                    ? "border-border bg-card"
                    : "border-primary/30 bg-primary/5",
                )}
              >
                {links[id] ? (
                  <Link
                    href={links[id]!}
                    onClick={() => !n.read && markRead(id)}
                    className="min-w-0 flex-1"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{body}</div>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {!n.read ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => markRead(id)}
                      aria-label="Mark read"
                    >
                      <Check className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={() => dismiss(id)}
                    aria-label="Dismiss"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}
