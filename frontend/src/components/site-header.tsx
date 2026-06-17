"use client";

import {
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Menu,
  PenLine,
  Settings,
  Shield,
  Sparkles,
  StickyNote,
  User,
  Users,
  Wrench,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { NotificationBell } from "@/components/forum/notification-bell";
import { UserAvatar } from "@/components/forum/user-avatar";
import { Link } from "@/components/link";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Latest", icon: Sparkles },
  { href: "/categories", label: "Categories", icon: LayoutGrid },
];

const STUDENT_NAV = [
  { href: "/assignments", label: "Assignments", icon: BookOpen },
  { href: "/grades", label: "Grades", icon: GraduationCap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: StickyNote },
];

const STAFF_NAV = [
  { href: "/staff", label: "Dashboard", icon: Sparkles },
  { href: "/staff/roster", label: "Roster", icon: Users },
  { href: "/staff/assignments", label: "Assignments", icon: BookOpen },
  { href: "/staff/gradebook", label: "Gradebook", icon: FileText },
  { href: "/staff/late-days", label: "Late Days", icon: Clock },
  { href: "/staff/calendar", label: "Calendar", icon: CalendarDays },
];

export function SiteHeader() {
  const { me, loading, can, logout, session } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasRosterSeat, setHasRosterSeat] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    if (!session) {
      setHasRosterSeat(false);
      setIsStaff(false);
      return;
    }
    api.roster.me({ session }).then((r) => {
      if ("error" in r) return;
      if (r.seat) {
        setHasRosterSeat(true);
        const s = r.seat as { kind?: string };
        setIsStaff(s.kind === "STAFF");
      }
    });
  }, [session]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary font-display text-lg font-semibold text-primary-foreground shadow-sm">
            C
          </span>
          <span className="hidden font-display text-xl font-semibold tracking-tight sm:inline">
            Commons
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(item.href) && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
          {hasRosterSeat && isStaff && (
            <Link
              href="/staff"
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary",
                pathname.startsWith("/staff") && "bg-primary/10 text-primary",
              )}
            >
              Staff
            </Link>
          )}
          {hasRosterSeat && STUDENT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(item.href) && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Button asChild size="sm" className="hidden gap-1.5 sm:inline-flex">
            <Link href="/new">
              <PenLine className="size-4" />
              New topic
            </Link>
          </Button>

          {me ? <NotificationBell /> : null}
          <ModeToggle />

          {loading ? null : me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  <UserAvatar
                    user={String(me.user)}
                    name={me.profile.displayName}
                    avatar={me.profile.avatar}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="font-semibold">
                    {me.profile.displayName}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    @{me.username}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/u/${me.user}`}>
                    <User className="size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/bookmarks">
                    <Bookmark className="size-4" /> Bookmarks
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="size-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                {can.moderate ? (
                  <DropdownMenuItem asChild>
                    <Link href="/moderation">
                      <Wrench className="size-4" /> Moderation
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {can.administer ? (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="size-4" /> Admin
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {hasRosterSeat && isStaff ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      LMS Staff
                    </DropdownMenuLabel>
                    {STAFF_NAV.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href}>
                          <item.icon className="size-4" /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : hasRosterSeat && !isStaff ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      LMS
                    </DropdownMenuLabel>
                    {STUDENT_NAV.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href}>
                          <item.icon className="size-4" /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/register">Join</Link>
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-border bg-background px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <item.icon className="size-4" /> {item.label}
              </Link>
            ))}
            {hasRosterSeat && (
              <>
                <div className="mt-2 mb-1 px-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LMS</p>
                </div>
                {isStaff && (
                  <Link
                    href="/staff"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary/80 hover:bg-primary/10"
                  >
                    <Sparkles className="size-4" /> Staff Dashboard
                  </Link>
                )}
                {STUDENT_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <item.icon className="size-4" /> {item.label}
                  </Link>
                ))}
              </>
            )}
            <Link
              href="/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <PenLine className="size-4" /> New topic
            </Link>
            {!me ? (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <User className="size-4" /> Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Bell className="size-4" /> Join
                </Link>
              </>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
