"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { accentFor, initials } from "@/lib/format";
import { useProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user: string;
  /** Optional explicit name; otherwise resolved from the profile cache. */
  name?: string;
  /** Optional explicit avatar URL; otherwise resolved from the profile cache. */
  avatar?: string;
  className?: string;
}

/**
 * Avatar for a user id. Resolves display name + avatar from the profile cache,
 * falling back to deterministic initials on a stable, id-derived accent.
 */
export function UserAvatar({ user, name, avatar, className }: UserAvatarProps) {
  const profile = useProfile(name ? null : user);
  const displayName = name ?? profile?.displayName ?? "";
  const src = avatar ?? profile?.avatar ?? "";

  return (
    <Avatar className={cn("size-9 border border-border/70", className)}>
      {src ? <AvatarImage src={src} alt={displayName} /> : null}
      <AvatarFallback
        className="font-medium text-white"
        style={{ backgroundColor: accentFor(user) }}
      >
        {initials(displayName || "?")}
      </AvatarFallback>
    </Avatar>
  );
}
