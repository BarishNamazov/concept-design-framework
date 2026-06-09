"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Header bell that polls the unread notification count for the session. */
export function NotificationBell() {
  const { session } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const poll = async () => {
      const result = await api.notifications.unreadCount({ session });
      if (active && !("error" in result)) setCount(result.count);
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [session]);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
    >
      <Link href="/notifications">
        <Bell className="size-[1.15rem]" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold leading-4 text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
