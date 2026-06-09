"use client";

import { CheckCircle2, Lock, MessageSquare } from "lucide-react";
import { CategoryBadge, TagBadge } from "@/components/forum/badges";
import { UserAvatar } from "@/components/forum/user-avatar";
import { Link } from "@/components/link";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import {
  bodyExcerpt,
  count,
  relativeTime,
  titleFromContent,
} from "@/lib/format";
import { enrichTopic } from "@/lib/loaders";
import type { ConversationSummary } from "@/lib/models";
import { useProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

/** Stacked participant avatars, capped with a "+N" overflow. */
function Participants({ users }: { users: string[] }) {
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((u) => (
        <UserAvatar key={u} user={u} className="size-6 ring-2 ring-card" />
      ))}
      {extra > 0 ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export function TopicRow({
  summary,
  index = 0,
}: {
  summary: ConversationSummary;
  index?: number;
}) {
  const conversation = String(summary.conversation);
  const author = String(summary.post.author);
  const authorProfile = useProfile(author);
  const { data } = useQuery(() => enrichTopic(summary), [conversation]);
  const resolved = useQuery<{ resolved: boolean }>(
    () => api.resolutions.isResolved({ question: String(summary.item) }),
    [conversation],
  );

  const title = titleFromContent(summary.post.content);
  const preview = bodyExcerpt(summary.post.content);

  return (
    <article
      className="group animate-rise"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <div className="flex gap-4 rounded-xl border border-transparent px-3 py-4 transition-colors hover:border-border hover:bg-card">
        <UserAvatar
          user={author}
          name={authorProfile?.displayName}
          avatar={authorProfile?.avatar}
          className="mt-0.5 hidden size-10 shrink-0 sm:flex"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 font-display text-lg font-semibold leading-snug tracking-tight">
              <Link
                href={`/t/${conversation}`}
                className="text-foreground decoration-primary/40 underline-offset-4 hover:text-primary hover:underline"
              >
                {title}
              </Link>
            </h3>
            {data?.locked ? (
              <Lock
                className="mt-1 size-4 shrink-0 text-muted-foreground"
                aria-label="Locked"
              />
            ) : null}
            {resolved.data?.resolved ? (
              <CheckCircle2
                className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-label="Solved"
              />
            ) : null}
          </div>

          {preview ? (
            <p className="mt-2 line-clamp-2 border-l border-primary/30 pl-3 text-[0.925rem] leading-6 text-foreground/70">
              {preview}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {data?.category ? (
              <CategoryBadge
                id={String(data.category.category)}
                name={data.category.name}
              />
            ) : null}
            {data?.tags.map((tag) => (
              <TagBadge
                key={String(tag.tag)}
                id={String(tag.tag)}
                name={tag.name}
              />
            ))}
            <span className="inline-flex min-h-6 items-center gap-1.5">
              <UserAvatar
                user={author}
                name={authorProfile?.displayName}
                avatar={authorProfile?.avatar}
                className="size-5 sm:hidden"
              />
              <Link
                href={`/u/${author}`}
                className="inline-flex items-center font-medium leading-none text-foreground/80 hover:text-primary"
              >
                {authorProfile?.displayName ?? "…"}
              </Link>
            </span>
            <span aria-hidden className="hidden sm:inline">
              ·
            </span>
            <time dateTime={String(summary.post.createdAt)}>
              {relativeTime(summary.post.createdAt)}
            </time>
            {summary.lastActivityAt &&
            String(summary.lastActivityAt) !==
              String(summary.post.createdAt) ? (
              <>
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-primary/80">
                  <span className="size-1 rounded-full bg-primary/60" />
                  {relativeTime(summary.lastActivityAt)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end justify-between gap-3 sm:flex">
          {data ? (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums",
                  data.stats.replyCount > 0
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                title={count(data.stats.replyCount, "reply", "replies")}
              >
                <MessageSquare className="size-3.5" />
                {data.stats.replyCount}
              </span>
              <Participants users={data.stats.participants} />
            </>
          ) : (
            <span className="h-6 w-10 animate-pulse rounded-full bg-muted" />
          )}
        </div>
      </div>
      <div className="mx-3 border-b border-border/60" />
    </article>
  );
}
