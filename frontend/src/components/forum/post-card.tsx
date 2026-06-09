"use client";

import {
  CheckCircle2,
  CornerUpLeft,
  Flag as FlagIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BookmarkButton } from "@/components/forum/bookmark-button";
import { Composer } from "@/components/forum/composer";
import { FlagDialog } from "@/components/forum/flag-dialog";
import { PinControl } from "@/components/forum/pin-control";
import { PostLinks } from "@/components/forum/post-links";
import { ReactionBar } from "@/components/forum/reaction-bar";
import { RenderedMarkdown } from "@/components/forum/rendered-markdown";
import { RevisionsDialog } from "@/components/forum/revisions-dialog";
import { UserAvatar } from "@/components/forum/user-avatar";
import { UserName } from "@/components/forum/user-name";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import type { ThreadNode } from "@/lib/models";
import { cn } from "@/lib/utils";

interface PostCardProps {
  node: ThreadNode;
  isRoot: boolean;
  /** Root post id — the question for resolution purposes. */
  questionId: string;
  /** Author of the root post (only they can accept answers). */
  rootAuthorId: string;
  acceptedAnswer: string | null;
  locked: boolean;
  /** Pin scope — the conversation id. */
  scope: string;
  /** New since the reader's last visit — gets a subtle highlight + badge. */
  isUnread?: boolean;
  onChanged: () => void;
}

export function PostCard({
  node,
  isRoot,
  questionId,
  rootAuthorId,
  acceptedAnswer,
  locked,
  scope,
  isUnread = false,
  onChanged,
}: PostCardProps) {
  const { session, me, can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  const postId = String(node.item);
  const nodeId = String(node.node);
  const author = String(node.post.author);
  const myId = me ? String(me.user) : null;
  const isMine = myId === author;
  const canAcceptAnswers = !!myId && myId === rootAuthorId && !isRoot;
  const isAccepted = acceptedAnswer === postId;
  const edited = !!node.post.editedAt;

  const trashed = useQuery<{ trashed: boolean }>(
    () => api.trash.isTrashed({ item: postId }),
    [postId],
  );
  const isTrashed = trashed.data?.trashed ?? false;
  // Highlight new posts, but let the trashed/accepted states take precedence.
  const highlightUnread = isUnread && !isTrashed && !isAccepted;

  async function saveEdit(content: string) {
    if (!session) return;
    const result = await api.posts.edit({ session, post: postId, content });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Post updated");
      setEditing(false);
      onChanged();
    }
  }

  async function submitReply(content: string) {
    if (!session) return;
    const result = await api.threads.reply({
      session,
      parent: nodeId,
      content,
    });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Reply posted");
      setReplying(false);
      onChanged();
    }
  }

  async function remove() {
    if (!session) return;
    const result = await api.posts.delete({ session, post: postId });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Post deleted");
      onChanged();
    }
  }

  async function toggleAccepted() {
    if (!session) return;
    const result = isAccepted
      ? await api.resolutions.clear({ session, question: questionId })
      : await api.resolutions.accept({
          session,
          question: questionId,
          answer: postId,
        });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(isAccepted ? "Answer unmarked" : "Marked as the answer");
      onChanged();
    }
  }

  async function moderatorTrash() {
    if (!session) return;
    const result = isTrashed
      ? await api.trash.restore({ session, item: postId })
      : await api.trash.trash({ session, item: postId });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(isTrashed ? "Post restored" : "Post moved to trash");
      trashed.refetch();
      onChanged();
    }
  }

  return (
    <article
      id={`post-${postId}`}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm transition-colors sm:p-5",
        isTrashed
          ? "border-destructive/40 opacity-75"
          : isAccepted
            ? "border-emerald-500/50 ring-1 ring-emerald-500/20"
            : highlightUnread
              ? "border-primary/40 bg-primary/[0.04] ring-1 ring-primary/10"
              : "border-border",
      )}
    >
      {isTrashed ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
          <Trash2 className="size-3.5" />
          Removed by a moderator
        </p>
      ) : null}
      <header className="mb-3 flex items-start gap-3">
        <UserAvatar user={author} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <UserName user={author} />
            <span className="text-muted-foreground">·</span>
            <time className="text-muted-foreground" title={postId}>
              {relativeTime(node.post.createdAt)}
            </time>
            {highlightUnread ? (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                New
              </span>
            ) : null}
            {edited ? (
              <>
                <span className="text-muted-foreground">·</span>
                <RevisionsDialog item={postId} />
              </>
            ) : null}
          </div>
        </div>
        {isAccepted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Answer
          </span>
        ) : null}
      </header>

      {editing ? (
        <Composer
          session={session ?? undefined}
          initialValue={node.post.content}
          submitLabel="Save edit"
          autoFocus
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <RenderedMarkdown html={node.rendered} />
      )}

      {!editing ? <PostLinks post={postId} /> : null}

      {!editing ? (
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <ReactionBar target={postId} />
          <div className="flex items-center gap-0.5">
            {canAcceptAnswers ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAccepted}
                className={cn(
                  "gap-1.5",
                  isAccepted
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {isAccepted ? (
                  <XCircle className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {isAccepted ? "Unmark" : "Accept"}
              </Button>
            ) : null}
            <BookmarkButton item={postId} />
            <PinControl item={postId} scope={scope} onChanged={onChanged} />
            {session && !locked ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplying((v) => !v)}
                className="gap-1.5 text-muted-foreground"
              >
                <CornerUpLeft className="size-4" />
                Reply
              </Button>
            ) : null}
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isMine ? (
                    <>
                      <DropdownMenuItem onClick={() => setEditing(true)}>
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={remove}>
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onClick={() => setFlagOpen(true)}>
                    <FlagIcon className="size-4" />
                    Report
                  </DropdownMenuItem>
                  {can.moderate ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={moderatorTrash}>
                        <Trash2 className="size-4" />
                        {isTrashed ? "Restore post" : "Trash (mod)"}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </footer>
      ) : null}

      {replying ? (
        <div className="mt-4">
          <Composer
            session={session ?? undefined}
            placeholder="Write a reply…"
            submitLabel="Post reply"
            minRows={4}
            autoFocus
            onSubmit={submitReply}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : null}

      <FlagDialog target={postId} open={flagOpen} onOpenChange={setFlagOpen} />
    </article>
  );
}
