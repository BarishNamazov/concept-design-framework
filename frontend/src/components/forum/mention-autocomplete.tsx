"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/forum/states";
import { UserAvatar } from "@/components/forum/user-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MentionUser {
  user: string;
  username: string;
  profile: {
    displayName: string;
    bio: string;
    avatar: string;
  };
}

interface MentionAutocompleteProps {
  query: string;
  session: string;
  onSelect: (username: string) => void;
  onClose: () => void;
}

export function MentionAutocomplete({
  query,
  session,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [results, setResults] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  onSelectRef.current = onSelect;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setError(null);
      try {
        const result = await api.users.search({ session, query });
        if ("error" in result) {
          setError(result.error);
          setResults([]);
        } else {
          setResults(result.users);
          setCursor(0);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(debounceRef.current);
  }, [query, session]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setCursor((c) => Math.max(c - 1, 0));
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (results[cursor]) {
            onSelectRef.current(results[cursor].username);
          }
          break;
        case "Escape":
          e.preventDefault();
          onCloseRef.current();
          break;
      }
    }
    if (results.length > 0 || loading) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [results, cursor, loading]);

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onCloseRef.current();
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef}>
      <div className="absolute left-0 right-3 top-0 -translate-y-full mb-1 z-50 rounded-md border bg-popover shadow-md">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Searching…
          </div>
        ) : error ? (
          <div className="px-3 py-3 text-sm text-destructive">{error}</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            No users found
          </div>
        ) : (
          <ScrollArea className="max-h-60">
            <div ref={listRef}>
              {results.map((user, i) => (
                <button
                  key={user.user}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                    i === cursor
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  onClick={() => onSelect(user.username)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <UserAvatar
                    user={user.user}
                    name={user.profile.displayName || user.username}
                    avatar={user.profile.avatar || undefined}
                    className="size-7 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{user.username}</div>
                    {user.profile.displayName ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {user.profile.displayName}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
