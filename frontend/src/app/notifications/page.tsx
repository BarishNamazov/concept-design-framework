"use client";

import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { RequireAuth } from "@/components/forum/require-auth";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { UserAvatar } from "@/components/forum/user-avatar";
import { UserName } from "@/components/forum/user-name";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { notifyHashTargetNavigation } from "@/hooks/use-hash-target-highlight";
import { useQuery } from "@/hooks/use-query";
import { api, isApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { excerpt, relativeTime } from "@/lib/format";
import type { Notification, PostView } from "@/lib/models";
import { cn } from "@/lib/utils";

function actionText(kind: string): string {
  switch (kind) {
    case "reply":
      return "replied to your post";
    case "followed_reply":
      return "replied in a topic you follow";
    case "mention":
      return "mentioned you";
    case "accepted":
      return "accepted your answer";
    default:
      return kind;
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'a, button, input, textarea, select, summary, [role="button"], [role="menuitem"]',
    ) !== null
  );
}

function renderExcerptWithMentions(content: string) {
  const text = excerpt(content);
  const parts: { key: string; value: string | { username: string } }[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(/@[a-zA-Z0-9_]+/g)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({
        key: `text-${lastIndex}-${index}`,
        value: text.slice(lastIndex, index),
      });
    }
    const username = match[0].slice(1);
    parts.push({ key: `mention-${index}-${username}`, value: { username } });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({
      key: `text-${lastIndex}-${text.length}`,
      value: text.slice(lastIndex),
    });
  }

  return parts.map((part) =>
    typeof part.value === "string" ? (
      <Fragment key={part.key}>{part.value}</Fragment>
    ) : (
      <Link
        key={part.key}
        href={`/u/${part.value.username}`}
        className="font-medium text-primary hover:underline"
      >
        @{part.value.username}
      </Link>
    ),
  );
}

function Notifications() {
  const { session } = useAuth();
  const router = useRouter();
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
  }, [notifications]);

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
            <Button
              variant="outline"
              size="sm"
              onClick={markAll}
              className="gap-2"
            >
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
            const body =
              post && n.kind !== "accepted" ? (
                <div className="flex items-start gap-3">
                  <UserAvatar
                    user={String(post.author)}
                    className="mt-0.5 size-7 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <UserName
                        user={String(post.author)}
                        className="text-sm"
                      />{" "}
                      <span className="text-muted-foreground">
                        {actionText(n.kind)}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                      {renderExcerptWithMentions(post.content)}
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
                      {renderExcerptWithMentions(post.content)}
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
            const href = links[id];
            const postId = String(n.link ?? "");

            function handleClick(e: MouseEvent<HTMLElement>) {
              if (isInteractiveTarget(e.target)) return;
              if (!n.read) markRead(id);
              if (href) {
                router.push(href);
                notifyHashTargetNavigation(`post-${postId}`);
              }
            }

            function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
              if (isInteractiveTarget(e.target)) return;
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (!n.read) markRead(id);
              if (href) {
                router.push(href);
                notifyHashTargetNavigation(`post-${postId}`);
              }
            }

            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: row click opens the linked post while nested buttons keep their own actions.
              <div
                key={id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors",
                  n.read
                    ? "border-border bg-card"
                    : "border-primary/30 bg-primary/5",
                  href &&
                    "cursor-pointer hover:border-primary/40 hover:bg-muted/25",
                )}
                role={href ? "link" : "button"}
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
              >
                <div className="min-w-0 flex-1">{body}</div>
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
