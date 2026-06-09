"use client";

import { Flag, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { PostPreview } from "@/components/forum/post-preview";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { UserName } from "@/components/forum/user-name";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime, shortId } from "@/lib/format";
import { loadPostConversationIndex } from "@/lib/loaders";
import type {
  Flag as FlagModel,
  LockedTarget,
  OpenFlag,
  TrashedItem,
} from "@/lib/models";

function FlagDetails({ target }: { target: string }) {
  const { data } = useQuery<{ flags: FlagModel[] }>(
    () => api.flags.forTarget({ target }),
    [target],
  );
  const open = (data?.flags ?? []).filter((f) => f.status === "open");
  if (open.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
      {open.map((f) => (
        <li key={String(f.flag)} className="text-muted-foreground">
          <UserName user={String(f.reporter)} className="text-foreground" />{" "}
          flagged this — <span className="italic">“{f.reason}”</span>{" "}
          <span className="text-xs">· {relativeTime(f.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function FlagsQueue() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{ targets: OpenFlag[] }>(
    session ? () => api.flags.open({ session }) : null,
    [session],
  );
  const flagItems = (data?.targets ?? []).map(({ target }) => String(target));
  const flagIndexKey = flagItems.join("\u0000");
  const index = useQuery<Record<string, string>>(
    flagItems.length > 0 ? () => loadPostConversationIndex(flagItems) : null,
    [flagIndexKey],
  );

  async function resolve(target: string, outcome: string) {
    if (!session) return;
    const result = await api.flags.resolve({ session, target, outcome });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`Flag ${outcome}`);
      refetch();
    }
  }

  async function trash(item: string) {
    if (!session) return;
    const result = await api.trash.trash({ session, item });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Post moved to trash");
      refetch();
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data || data.targets.length === 0)
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Queue is clear"
        description="There are no open flags to review. Nice work."
      />
    );

  return (
    <div className="space-y-4">
      {data.targets.map(({ target, count }) => {
        const item = String(target);
        return (
          <PostPreview
            key={item}
            item={item}
            conversation={index.data?.[item] ?? null}
            action={
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <Flag className="size-3" />
                {count}
              </span>
            }
            meta={
              <div>
                <FlagDetails target={item} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(item, "accepted")}
                  >
                    Uphold
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolve(item, "rejected")}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive"
                    onClick={() => trash(item)}
                  >
                    <Trash2 className="size-4" />
                    Trash post
                  </Button>
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

function LockedTopics() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{
    locked: LockedTarget[];
  }>(() => api.locks.list({}), []);

  async function unlock(target: string) {
    if (!session) return;
    const result = await api.locks.unlock({ session, target });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Topic unlocked");
      refetch();
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data || data.locked.length === 0)
    return (
      <EmptyState
        icon={Lock}
        title="No locked topics"
        description="Locked conversations will appear here."
      />
    );

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {data.locked.map((lock) => {
        const target = String(lock.target);
        return (
          <div
            key={target}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div>
              <Link
                href={`/t/${target}`}
                className="font-medium hover:text-primary"
              >
                Conversation {shortId(target)}
              </Link>
              <p className="text-xs text-muted-foreground">
                Locked {relativeTime(lock.lockedAt)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => unlock(target)}>
              Unlock
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function TrashBin() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{
    trashed: TrashedItem[];
  }>(() => api.trash.list({}), []);

  async function restore(item: string) {
    if (!session) return;
    const result = await api.trash.restore({ session, item });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Post restored");
      refetch();
    }
  }

  async function purge(item: string) {
    if (!session) return;
    const result = await api.trash.purge({ session, item });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Post permanently deleted");
      refetch();
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data || data.trashed.length === 0)
    return (
      <EmptyState
        icon={Trash2}
        title="Trash is empty"
        description="Soft-deleted posts can be restored or purged from here."
      />
    );

  return (
    <div className="space-y-4">
      {data.trashed.map((entry) => {
        const item = String(entry.item);
        return (
          <PostPreview
            key={item}
            item={item}
            meta={
              <span>
                Trashed by{" "}
                <UserName
                  user={String(entry.trashedBy)}
                  className="text-foreground"
                />{" "}
                {relativeTime(entry.trashedAt)}
              </span>
            }
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restore(item)}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => purge(item)}
                >
                  Purge
                </Button>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

export default function ModerationPage() {
  const { loading, can } = useAuth();

  if (loading)
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );

  if (!can.moderate)
    return (
      <PageContainer>
        <EmptyState
          icon={ShieldCheck}
          title="Moderators only"
          description="You don't have permission to view the moderation tools."
        />
      </PageContainer>
    );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Staff"
        title="Moderation"
        description="Review flagged content, manage locked topics, and the trash bin."
      />
      <Tabs defaultValue="flags">
        <TabsList>
          <TabsTrigger value="flags">Flag queue</TabsTrigger>
          <TabsTrigger value="locked">Locked</TabsTrigger>
          <TabsTrigger value="trash">Trash</TabsTrigger>
        </TabsList>
        <TabsContent value="flags" className="mt-6">
          <FlagsQueue />
        </TabsContent>
        <TabsContent value="locked" className="mt-6">
          <LockedTopics />
        </TabsContent>
        <TabsContent value="trash" className="mt-6">
          <TrashBin />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
