"use client";

import { FolderCog } from "lucide-react";
import { toast } from "sonner";
import { CategoryDot } from "@/components/forum/badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@/hooks/use-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Category } from "@/lib/models";

/** Moderator control to file the root post under a category (or clear it). */
export function CategoryAssign({
  item,
  current,
  onChanged,
}: {
  item: string;
  current: string | null;
  onChanged: () => void;
}) {
  const { session, can } = useAuth();
  const { data } = useQuery<{ categories: Category[] }>(
    () => api.categories.list({}),
    [],
  );

  if (!session || !can.moderate) return null;
  const categories = data?.categories ?? [];

  async function assign(category: string) {
    if (!session) return;
    const result = await api.categories.assign({ session, item, category });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Category updated");
      onChanged();
    }
  }

  async function unassign() {
    if (!session) return;
    const result = await api.categories.unassign({ session, item });
    if ("error" in result) toast.error(result.error);
    else {
      toast.success("Category cleared");
      onChanged();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FolderCog className="size-4" />
          Category
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>File under…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {categories.map((category) => (
          <DropdownMenuItem
            key={String(category.category)}
            onClick={() => assign(String(category.category))}
            disabled={current === String(category.category)}
          >
            <CategoryDot id={String(category.category)} />
            {category.name}
          </DropdownMenuItem>
        ))}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={unassign}>
              Remove from category
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
