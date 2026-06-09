"use client";

import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { PostPreview } from "@/components/forum/post-preview";
import { RequireAuth } from "@/components/forum/require-auth";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { loadPostConversationIndex } from "@/lib/loaders";
import type { Bookmark as BookmarkModel } from "@/lib/models";

function Bookmarks() {
  const { session } = useAuth();
  const { data, error, loading, refetch } = useQuery<{
    bookmarks: BookmarkModel[];
  }>(session ? () => api.bookmarks.list({ session }) : null, [session]);
  const bookmarkItems = (data?.bookmarks ?? []).map((bookmark) =>
    String(bookmark.item),
  );
  const bookmarkIndexKey = bookmarkItems.join("\u0000");
  const index = useQuery<Record<string, string>>(
    bookmarkItems.length > 0
      ? () => loadPostConversationIndex(bookmarkItems)
      : null,
    [bookmarkIndexKey],
  );

  async function unsave(item: string) {
    if (!session) return;
    const result = await api.bookmarks.unsave({ session, item });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Bookmark removed");
      refetch();
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Your library"
        title="Bookmarks"
        description="Posts you've saved to revisit later."
      />
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.bookmarks.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Tap the bookmark icon on any post to save it here."
        />
      ) : (
        <div className="space-y-4">
          {data.bookmarks.map((bookmark) => {
            const item = String(bookmark.item);
            return (
              <PostPreview
                key={item}
                item={item}
                conversation={index.data?.[item] ?? null}
                meta={`Saved ${relativeTime(bookmark.savedAt)}`}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unsave(item)}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <Bookmark className="size-4 fill-current text-primary" />
                    Remove
                  </Button>
                }
              />
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export default function BookmarksPage() {
  return (
    <RequireAuth>
      <Bookmarks />
    </RequireAuth>
  );
}
