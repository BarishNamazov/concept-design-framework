"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@/lib/auth";

export function UserAvatar({ user }: { user: User }) {
  const initial = (user.profile.displayName || user.username)[0].toUpperCase();
  return (
    <Avatar className="h-8 w-8">
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
