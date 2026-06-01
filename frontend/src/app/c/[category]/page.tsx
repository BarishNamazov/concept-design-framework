"use client";

import { use } from "react";
import { FolderOpen } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/forum/page";
import { PostPreview } from "@/components/forum/post-preview";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { loadPostConversationIndex } from "@/lib/loaders";
import type { Category } from "@/lib/models";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = use(params);

  const categories = useQuery<{ categories: Category[] }>(
    () => api.categories.list({}),
    [],
  );
  const items = useQuery<{ items: { item: string }[] }>(
    () => api.categories.items({ category }),
    [category],
  );
  const categoryItems = (items.data?.items ?? []).map(({ item }) =>
    String(item),
  );
  const categoryIndexKey = categoryItems.join("\u0000");
  const index = useQuery<Record<string, string>>(
    categoryItems.length > 0
      ? () => loadPostConversationIndex(categoryItems)
      : null,
    [categoryIndexKey],
  );

  const meta = categories.data?.categories.find(
    (c) => String(c.category) === category,
  );
  const loading = categories.loading || items.loading;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Category"
        title={meta?.name ?? "Category"}
        description={meta?.description || undefined}
      />
      {loading && !items.data ? (
        <LoadingState />
      ) : items.error ? (
        <ErrorState message={items.error} onRetry={items.refetch} />
      ) : !items.data || items.data.items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nothing here yet"
          description="No topics have been filed under this category."
        />
      ) : (
        <div className="space-y-4">
          {items.data.items.map(({ item }) => (
            <PostPreview
              key={String(item)}
              item={String(item)}
              conversation={index.data?.[String(item)] ?? null}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
