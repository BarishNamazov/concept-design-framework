"use client";

import { Bell, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { RequireAuth } from "@/components/forum/require-auth";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime, shortId, titleFromContent } from "@/lib/format";
import { loadFeed } from "@/lib/loaders";
import type { ConversationSummary, Subscription } from "@/lib/models";

function Subscriptions() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{
    subscriptions: Subscription[];
  }>(session ? () => api.subscriptions.mine({ session }) : null, [session]);
  const feed = useQuery<ConversationSummary[]>(() => loadFeed(), []);

  const byConversation = new Map<string, ConversationSummary>();
  for (const s of feed.data ?? [])
    byConversation.set(String(s.conversation), s);

  async function unsubscribe(target: string) {
    if (!session) return;
    const result = await api.subscriptions.unsubscribe({ session, target });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Unfollowed");
      refetch();
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Following"
        title="Subscriptions"
        description="Topics you're watching for new replies."
      />
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.subscriptions.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Not following anything"
          description="Follow a topic to keep tabs on the conversation."
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.subscriptions.map((sub) => {
            const target = String(sub.target);
            const summary = byConversation.get(target);
            const title = summary
              ? titleFromContent(summary.post.content)
              : `Conversation ${shortId(target)}`;
            return (
              <div
                key={target}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/t/${target}`}
                    className="font-display text-lg font-semibold hover:text-primary"
                  >
                    {title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="size-3.5" />
                    Followed {relativeTime(sub.createdAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unsubscribe(target)}
                >
                  Unfollow
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export default function SubscriptionsPage() {
  return (
    <RequireAuth>
      <Subscriptions />
    </RequireAuth>
  );
}
