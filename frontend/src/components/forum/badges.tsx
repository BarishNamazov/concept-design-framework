import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { accentFor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A small colored dot keyed to a category id (Discourse-style). */
export function CategoryDot({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2.5 rounded-[3px]", className)}
      style={{ backgroundColor: accentFor(id) }}
    />
  );
}

/** A clickable category chip with its signature dot. */
export function CategoryBadge({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Link href={`/c/${id}`} className={cn("inline-flex", className)}>
      <Badge
        variant="outline"
        className="gap-1.5 border-border bg-card font-medium hover:bg-muted"
      >
        <CategoryDot id={id} />
        {name}
      </Badge>
    </Link>
  );
}

/** A clickable tag chip. */
export function TagBadge({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Link href={`/tags/${id}`} className={cn("inline-flex", className)}>
      <Badge
        variant="secondary"
        className="font-normal text-muted-foreground hover:text-foreground"
      >
        #{name}
      </Badge>
    </Link>
  );
}
