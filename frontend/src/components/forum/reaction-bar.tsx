"use client";

import { SmilePlus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { REACTION_KINDS } from "@/lib/constants";
import type { Reaction } from "@/lib/models";
import { cn } from "@/lib/utils";

/** Reaction summary + toggling for one post, scoped to the current user. */
export function ReactionBar({ target }: { target: string }) {
  const { session, me } = useAuth();
  const { data, refetch } = useQuery<{ reactions: Reaction[] }>(
    () => api.reactions.forTarget({ target }),
    [target],
  );

  const reactions = useMemo(() => data?.reactions ?? [], [data]);
  const myId = me ? String(me.user) : null;

  const groups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const prev = map.get(r.kind) ?? { count: 0, mine: false };
      map.set(r.kind, {
        count: prev.count + 1,
        mine: prev.mine || String(r.user) === myId,
      });
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [reactions, myId]);

  async function toggle(kind: string, mine: boolean) {
    if (!session) {
      toast.error("Sign in to react.");
      return;
    }
    const result = mine
      ? await api.reactions.remove({ session, target, kind })
      : await api.reactions.add({ session, target, kind });
    if ("error" in result) toast.error(result.error);
    else refetch();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {groups.map(([kind, { count, mine }]) => (
        <button
          key={kind}
          type="button"
          onClick={() => toggle(kind, mine)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors",
            mine
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
          title={mine ? "Remove your reaction" : "React"}
        >
          <span className="leading-none">{kind}</span>
          <span className="text-xs font-semibold tabular-nums">{count}</span>
        </button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Add reaction"
          >
            <SmilePlus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1.5">
          <div className="flex gap-0.5">
            {REACTION_KINDS.map((kind) => {
              const mine = groups.find(([k]) => k === kind)?.[1].mine ?? false;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggle(kind, mine)}
                  className={cn(
                    "rounded-md p-1.5 text-lg transition-transform hover:scale-110 hover:bg-muted",
                    mine && "bg-primary/10",
                  )}
                >
                  {kind}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
