"use client";

import { type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/components/link";
import { UserAvatar } from "@/components/forum/user-avatar";
import { UserName } from "@/components/forum/user-name";
import { RenderedMarkdown } from "@/components/forum/rendered-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyHashTargetNavigation } from "@/hooks/use-hash-target-highlight";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import type { PostView } from "@/lib/models";
import { relativeTime, titleFromContent } from "@/lib/format";
import { cn } from "@/lib/utils";

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'a, button, input, textarea, select, summary, [role="button"], [role="menuitem"]',
    ) !== null
  );
}

/**
 * A compact, self-contained preview of a single post (resolved via
 * `/posts/get`). Used by every post-list surface — bookmarks, a category's
 * items, a tag's targets, a user's posts. When the thread can be resolved, the
 * entire card opens the post in its conversation.
 */
export function PostPreview({
  item,
  conversation,
  meta,
  action,
  showTitle = true,
}: {
  item: string;
  conversation?: string | null;
  /** Optional trailing meta line (e.g. "saved 2h ago"). */
  meta?: React.ReactNode;
  /** Optional action node rendered in the top-right (e.g. restore button). */
  action?: React.ReactNode;
  /** Whether to render a separate title above the post body preview. */
  showTitle?: boolean;
}) {
  const router = useRouter();
  const { data, loading } = useQuery<{ post: PostView }>(
    () => api.posts.get({ post: item }),
    [item],
  );
  const location = useQuery<{ conversation: string | null }>(
    conversation ? null : () => api.threads.forItem({ item }),
    [item, conversation],
  );

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        This post is no longer available.
      </div>
    );
  }

  const post = data.post;
  const author = String(post.author);
  const title = titleFromContent(post.content);
  const resolvedConversation = conversation ?? location.data?.conversation;
  const href = resolvedConversation
    ? `/t/${resolvedConversation}#post-${item}`
    : null;

  function openPost() {
    if (!href) return;
    router.push(href);
    notifyHashTargetNavigation(`post-${item}`);
  }

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!href || isInteractiveTarget(event.target)) return;
    openPost();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!href || isInteractiveTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPost();
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-border/80 sm:p-5",
        href &&
          "cursor-pointer hover:border-primary/40 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      aria-label={href ? `Open post: ${title}` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar user={author} className="size-7" />
          <div className="min-w-0 text-sm">
            <UserName user={author} />
            <span className="mx-1.5 text-muted-foreground">·</span>
            <time className="text-muted-foreground">
              {relativeTime(post.createdAt)}
            </time>
          </div>
        </div>
        {action}
      </div>

      {href && showTitle ? (
        <h3 className="mb-1.5 font-display text-lg font-semibold leading-snug">
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-foreground hover:text-primary"
          >
            {title}
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </h3>
      ) : null}

      <RenderedMarkdown
        html={post.rendered}
        className={cn(
          "line-clamp-4 text-sm",
          !showTitle &&
            "[&>*+*]:mt-2 [&>h1:first-child]:mt-0 [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:leading-6 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:leading-6 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:leading-6 [&_p]:leading-6",
        )}
      />

      {meta ? (
        <div className="mt-3 text-xs text-muted-foreground">{meta}</div>
      ) : null}
    </article>
  );
}
