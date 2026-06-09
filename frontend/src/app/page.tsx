"use client";

import { MessagesSquare, PenLine } from "lucide-react";
import { useCallback, useState } from "react";
import { CategoryDot } from "@/components/forum/badges";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/forum/states";
import { TopicRow } from "@/components/forum/topic-row";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadFeed } from "@/lib/loaders";
import type { Category } from "@/lib/models";

function CategoriesCard() {
  const { data } = useQuery<{ categories: Category[] }>(
    () => api.categories.list({}),
    [],
  );
  const categories = data?.categories ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Categories</p>
        <Link
          href="/categories"
          className="text-xs font-medium text-primary hover:underline"
        >
          All
        </Link>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {categories.slice(0, 8).map((c) => (
            <li key={String(c.category)}>
              <Link
                href={`/c/${c.category}`}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <CategoryDot id={String(c.category)} />
                <span className="truncate font-medium">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WelcomeCard() {
  const { me } = useAuth();
  if (me) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <h3 className="font-display text-lg font-semibold tracking-tight">
        Welcome to the Commons
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        A quiet reading room for long-form discussion. Sign in to post, reply,
        react, and follow conversations.
      </p>
      <div className="mt-4 flex gap-2">
        <Button asChild size="sm">
          <Link href="/register">Create account</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [sort, setSort] = useState<"latest" | "activity">("latest");
  const { data, loading, error, refetch } = useQuery(
    useCallback(() => loadFeed(sort), [sort]),
    [sort],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_18rem] lg:py-10">
      <section className="min-w-0">
        <div className="mb-5 flex items-end justify-between border-b border-border pb-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Conversations
            </h1>
            <div className="mt-2 inline-flex rounded-lg border bg-card p-0.5 shadow-xs">
              <button
                type="button"
                aria-pressed={sort === "latest"}
                className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-all ${
                  sort === "latest"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSort("latest")}
              >
                Latest
              </button>
              <button
                type="button"
                aria-pressed={sort === "activity"}
                className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-all ${
                  sort === "activity"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSort("activity")}
              >
                Activity
              </button>
            </div>
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/new">
              <PenLine className="size-4" /> New topic
            </Link>
          </Button>
        </div>

        {loading && !data ? (
          <LoadingState label="Gathering the latest…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : data && data.length > 0 ? (
          <div className="-mx-3">
            {data.map((summary, i) => (
              <TopicRow
                key={String(summary.conversation)}
                summary={summary}
                index={i}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Be the first to start a topic and get the room talking."
            action={
              <Button asChild size="sm">
                <Link href="/new">Start a topic</Link>
              </Button>
            }
          />
        )}
      </section>

      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <WelcomeCard />
        <CategoriesCard />
      </aside>
    </div>
  );
}
