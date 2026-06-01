"use client";

import { use } from "react";
import { Settings } from "lucide-react";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/forum/page";
import { UserAvatar } from "@/components/forum/user-avatar";
import { PostPreview } from "@/components/forum/post-preview";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { useQuery } from "@/hooks/use-query";
import { useAuth } from "@/lib/auth";
import { loadPostConversationIndex, loadUserOverview } from "@/lib/loaders";
import { count } from "@/lib/format";

export default function UserPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = use(params);
  const { me } = useAuth();
  const isSelf = me ? String(me.user) === user : false;

  const overview = useQuery(() => loadUserOverview(user), [user]);
  const postIds = overview.data?.postIds ?? [];
  const postIndexKey = postIds.join("\u0000");
  const index = useQuery<Record<string, string>>(
    postIds.length > 0 ? () => loadPostConversationIndex(postIds) : null,
    [postIndexKey],
  );

  if (overview.loading && !overview.data)
    return (
      <PageContainer>
        <LoadingState label="Loading profile…" />
      </PageContainer>
    );
  if (overview.error)
    return (
      <PageContainer>
        <ErrorState message={overview.error} onRetry={overview.refetch} />
      </PageContainer>
    );
  if (!overview.data) return null;

  const { profile } = overview.data;

  return (
    <PageContainer>
      <header className="mb-8 flex flex-col items-start gap-5 border-b border-border pb-8 sm:flex-row sm:items-center">
        <UserAvatar
          user={user}
          name={profile.displayName}
          avatar={profile.avatar}
          className="size-20 text-2xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {profile.displayName}
          </h1>
          {profile.bio ? (
            <p className="mt-2 max-w-prose text-muted-foreground">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground italic">
              No bio yet.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {count(postIds.length, "post")}
          </p>
        </div>
        {isSelf ? (
          <Button asChild variant="outline" className="gap-2">
            <Link href="/settings">
              <Settings className="size-4" />
              Edit profile
            </Link>
          </Button>
        ) : null}
      </header>

      <h2 className="eyebrow mb-4">Recent posts</h2>
      {postIds.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description="When this person posts, their contributions will appear here."
        />
      ) : (
        <div className="space-y-4">
          {postIds.map((item) => (
            <PostPreview
              key={item}
              item={item}
              conversation={index.data?.[item] ?? null}
              showTitle={false}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
