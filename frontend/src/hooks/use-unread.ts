"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Read-tracking for a conversation (Unread concept). Marks all posts in the
 * conversation as seen on open, exposes the set of post ids that are new since
 * the last visit (so individual posts can be highlighted), the new-post count,
 * and a one-tap "mark all read". Fetch once per thread and share the result.
 */
export function useUnread(conversation: string, rootItem: string) {
  const { session } = useAuth();
  const list = useQuery<{ items: { item: string }[] }>(
    session ? () => api.unread.list({ session, scope: conversation }) : null,
    [session, conversation],
  );
  const count = useQuery<{ count: number }>(
    session ? () => api.unread.count({ session, scope: conversation }) : null,
    [session, conversation],
  );

  const refetchList = list.refetch;
  const refetchCount = count.refetch;

  // Opening the topic marks all posts in the conversation as seen.
  useEffect(() => {
    if (!session || !rootItem) return;
    void api.unread
      .markAllSeen({ session, scope: conversation })
      .then(() => {
        refetchList();
        refetchCount();
      });
  }, [session, rootItem, conversation, refetchList, refetchCount]);

  const unreadItems = useMemo(() => {
    const items = list.data?.items ?? [];
    // The root post is what the reader is opening to; don't flag it as new.
    return new Set(
      items.map((i) => String(i.item)).filter((id) => id !== rootItem),
    );
  }, [list.data, rootItem]);

  const newCount = count.data?.count ?? unreadItems.size;

  async function markAll() {
    if (!session) return;
    await api.unread.markAllSeen({ session, scope: conversation });
    list.refetch();
    count.refetch();
  }

  return { unreadItems, newCount, markAll, enabled: !!session };
}
