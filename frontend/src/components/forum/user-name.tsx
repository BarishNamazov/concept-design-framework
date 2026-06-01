"use client";

import { Link } from "@/components/link";
import { cn } from "@/lib/utils";
import { useProfile } from "@/lib/profiles";

/** A user's display name as a link to their profile, resolved from the cache. */
export function UserName({
  user,
  className,
  fallback = "Someone",
}: {
  user: string;
  className?: string;
  fallback?: string;
}) {
  const profile = useProfile(user);
  return (
    <Link
      href={`/u/${user}`}
      className={cn(
        "font-medium text-foreground hover:text-primary hover:underline underline-offset-2",
        className,
      )}
    >
      {profile?.displayName ?? fallback}
    </Link>
  );
}
