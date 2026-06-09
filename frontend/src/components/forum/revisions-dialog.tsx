"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { LoadingState } from "@/components/forum/states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { fullTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Version history for a post (revisions concept), shown in a dialog. */
export function RevisionsDialog({ item }: { item: string }) {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
        <History className="size-3.5" />
        Edited
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Edit history</DialogTitle>
          <DialogDescription>
            Browse every saved version of this post.
          </DialogDescription>
        </DialogHeader>
        <RevisionsBody item={item} />
      </DialogContent>
    </Dialog>
  );
}

function RevisionsBody({ item }: { item: string }) {
  const list = useQuery(() => api.revisions.list({ item }), [item]);
  const latest = useQuery(() => api.revisions.latest({ item }), [item]);
  const [selected, setSelected] = useState<number | null>(null);

  if (list.loading) return <LoadingState label="Loading history…" />;
  const revisions = list.data?.revisions ?? [];
  if (revisions.length === 0)
    return <p className="text-sm text-muted-foreground">No revisions found.</p>;

  const latestNumber = revisions[revisions.length - 1]?.number ?? null;
  const active = selected ?? latestNumber;

  return (
    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
      <ScrollArea className="max-h-[55vh] sm:pr-2">
        <ol className="space-y-1">
          {[...revisions].reverse().map((rev) => {
            const isLatest = rev.number === latestNumber;
            return (
              <li key={String(rev.revision)}>
                <button
                  type="button"
                  onClick={() => setSelected(rev.number)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    active === rev.number
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Version {rev.number}
                    </span>
                    {isLatest ? (
                      <span className="text-[0.65rem] font-medium text-primary">
                        current
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(rev.savedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </ScrollArea>
      <div>
        {active != null ? (
          <RevisionContent item={item} number={active} />
        ) : null}
        {latest.data?.revision[0] ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Last edited {fullTime(latest.data.revision[0].savedAt)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Loads a single version's content on demand via `/revisions/get`. */
function RevisionContent({ item, number }: { item: string; number: number }) {
  const { data, loading } = useQuery(
    () => api.revisions.get({ item, number: number as unknown as string }),
    [item, number],
  );

  if (loading) return <LoadingState label="Loading version…" />;
  const content = data?.revision[0]?.content ?? "";
  return (
    <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm text-foreground/90">
      {content || "This version is empty."}
    </pre>
  );
}
