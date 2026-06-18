"use client";

import { Loader2, Plus, Tag as TagIcon, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Tag } from "@/lib/models";

/** Inline tag list with add/remove controls for one post (`target` = post id). */
export function TagEditor({
  target,
  tags,
  onChanged,
}: {
  target: string;
  tags: Tag[];
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [applyingTag, setApplyingTag] = useState<string | null>(null);

  const appliedIds = new Set(tags.map((t) => String(t.tag)));
  const availableTags = allTags.filter((t) => !appliedIds.has(String(t.tag)));

  const fetchTags = useCallback(async () => {
    setTagsLoading(true);
    const result = await api.tags.list({});
    setTagsLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setAllTags(result.tags);
  }, []);

  async function applyExisting(tag: Tag) {
    if (!session) return;
    setApplyingTag(String(tag.tag));
    const applied = await api.tags.add({
      session,
      target,
      tag: String(tag.tag),
    });
    setApplyingTag(null);
    if ("error" in applied) toast.error(applied.error);
    else {
      setName("");
      onChanged();
    }
  }

  async function add() {
    const trimmed = name.trim();
    if (!session || !trimmed) return;
    setBusy(true);
    const created = await api.tags.create({ session, name: trimmed });
    if ("error" in created) {
      setBusy(false);
      toast.error(created.error);
      return;
    }
    const applied = await api.tags.add({
      session,
      target,
      tag: String(created.tag),
    });
    setBusy(false);
    if ("error" in applied) toast.error(applied.error);
    else {
      setName("");
      onChanged();
    }
  }

  async function remove(tag: string) {
    if (!session) return;
    const result = await api.tags.remove({ session, target, tag });
    if ("error" in result) toast.error(result.error);
    else onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={String(tag.tag)} className="inline-flex items-center">
          <Link href={`/tags/${tag.tag}`}>
            <Badge
              variant="secondary"
              className="font-normal text-muted-foreground hover:text-foreground"
            >
              #{tag.name}
            </Badge>
          </Link>
          {session ? (
            <button
              type="button"
              onClick={() => remove(String(tag.tag))}
              className="-ml-1 rounded-full p-0.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}

      {session ? (
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) fetchTags();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            >
              <TagIcon className="size-3" />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            {tagsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : availableTags.length > 0 ? (
              <ScrollArea className="max-h-40 mb-3">
                <div className="space-y-1">
                  {availableTags.map((tag) => (
                    <button
                      key={String(tag.tag)}
                      type="button"
                      onClick={() => applyExisting(tag)}
                      disabled={applyingTag === String(tag.tag)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span className="truncate font-medium">#{tag.name}</span>
                      {applyingTag === String(tag.tag) ? (
                        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="size-3 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : null}

            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="tag name"
                className="h-8"
                autoFocus
              />
              <Button
                size="icon"
                className="size-8 shrink-0"
                onClick={add}
                disabled={busy || !name.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Type to create a new tag, or pick one above.
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
