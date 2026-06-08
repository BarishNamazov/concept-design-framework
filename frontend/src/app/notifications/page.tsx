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
import { UserAvatar } from "@/components/forum/user-avatar";
import { UserName } from "@/components/forum/user-name";
import { useQuery } from "@/hooks/use-query";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Notification, PostView } from "@/lib/models";
import { excerpt, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function actionText(kind: string): string {
  switch (kind) {
    case "reply":
      return "replied to your post";
    case "mention":
      return "mentioned you";
    case "accepted":
      return "accepted your answer";
    default:
      return kind;
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
  const [posts, setPosts] = useState<Record<string, PostView | null>>({});

  useEffect(() => {
    const resolveLinks = async () => {
      const resolvedLinks: Record<string, string | null> = {};
      const resolvedPosts: Record<string, PostView | null> = {};
      await Promise.all(
        notifications
          .filter((n) => n.link)
          .map(async (n) => {
            const notificationId = String(n.notification);
            const postId = String(n.link);
            try {
              const [convResult, postResult] = await Promise.all([
                api.threads.forItem({ item: postId }),
                api.posts.get({ post: postId }),
              ]);
              if (!isApiError(convResult) && convResult.conversation) {
                resolvedLinks[notificationId] =
                  `/t/${convResult.conversation}#post-${postId}`;
              }
              if (!isApiError(postResult)) {
                resolvedPosts[notificationId] = postResult.post;
              }
            } catch {
              // unresolvable; skip silently
            }
          }),
      );
      setLinks(resolvedLinks);
      setPosts(resolvedPosts);
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
            const post = posts[id];
            const showAuthor = post && n.kind !== "accepted";
            const body = showAuthor ? (
              <div className="flex items-start gap-3">
                <UserAvatar user={String(post!.author)} className="mt-0.5 size-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <UserName user={String(post!.author)} className="text-sm" />{" "}
                    <span className="text-muted-foreground">
                      {actionText(n.kind)}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                    {excerpt(post!.content)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
            ) : post ? (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="size-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">
                      {actionText(n.kind).charAt(0).toUpperCase() +
                        actionText(n.kind).slice(1)}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                    {excerpt(post.content)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </div>
            ) : (
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
                      {actionText(n.kind).charAt(0).toUpperCase() +
                        actionText(n.kind).slice(1)}
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
