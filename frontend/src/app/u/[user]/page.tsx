"use client";

import { Settings, Shield } from "lucide-react";
import { use } from "react";
import { PageContainer } from "@/components/forum/page";
import { PostPreview } from "@/components/forum/post-preview";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { UserAvatar } from "@/components/forum/user-avatar";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { count } from "@/lib/format";
import {
  loadPostConversationIndex,
  loadUserOverview,
  loadUserRoles,
} from "@/lib/loaders";

/**
 * Resolve a route param that may be a username (no hyphens, alphanumeric) or a
 * user ID (UUID with hyphens). Returns the resolved user ID.
 */
function useResolvedUser(raw: string): {
  userId: string | null;
  loading: boolean;
  error: string | null;
} {
  const isId = raw.includes("-");
  const resolve = useQuery<{ user: string }>(
    isId ? null : () => api.auth.resolve({ username: raw }),
    [raw, isId],
  );
  if (isId) return { userId: raw, loading: false, error: null };
  if (resolve.loading) return { userId: null, loading: true, error: null };
  if (resolve.error)
    return { userId: null, loading: false, error: resolve.error };
  if (!resolve.data || "error" in resolve.data)
    return { userId: null, loading: false, error: `User "${raw}" not found.` };
  return { userId: resolve.data.user, loading: false, error: null };
}

export default function UserPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = use(params);
  const {
    userId,
    loading: resolving,
    error: resolveError,
  } = useResolvedUser(user);
  const { me } = useAuth();

  const overview = useQuery(userId ? () => loadUserOverview(userId) : null, [
    userId,
  ]);
  const roles = useQuery(userId ? () => loadUserRoles(userId) : null, [userId]);
  const postIds = overview.data?.postIds ?? [];
  const postIndexKey = postIds.join("\u0000");
  const index = useQuery<Record<string, string>>(
    postIds.length > 0 ? () => loadPostConversationIndex(postIds) : null,
    [postIndexKey],
  );

  if (resolving)
    return (
      <PageContainer>
        <LoadingState label="Looking up user…" />
      </PageContainer>
    );
  if (resolveError)
    return (
      <PageContainer>
        <ErrorState message={resolveError} />
      </PageContainer>
    );
  if (!userId) return null;

  const isSelf = me ? String(me.user) === userId : false;

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
          user={userId}
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
          {roles.data && roles.data.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.data.map((role) => (
                <Badge
                  key={role.name}
                  variant="secondary"
                  className="gap-1 capitalize"
                >
                  <Shield className="size-3" />
                  {role.name}
                </Badge>
              ))}
            </div>
          ) : null}
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
