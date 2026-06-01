"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/models";

/**
 * A tiny request-coalescing cache for public profiles. The backend exposes
 * profiles one user at a time (`/profiles/get`); this provider deduplicates
 * concurrent lookups and memoizes results so a feed or thread full of the same
 * authors only fetches each profile once.
 */
interface ProfilesState {
  get: (user: string) => Profile | undefined;
  ensure: (user: string) => void;
}

const ProfilesContext = createContext<ProfilesState | null>(null);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<Record<string, Profile>>({});
  const inflight = useRef<Set<string>>(new Set());

  const ensure = useCallback(
    (user: string) => {
      if (!user || cache[user] || inflight.current.has(user)) return;
      inflight.current.add(user);
      api.profiles
        .get({ user })
        .then((result) => {
          if (!("error" in result)) {
            setCache((prev) => ({ ...prev, [user]: result.profile }));
          }
        })
        .finally(() => inflight.current.delete(user));
    },
    [cache],
  );

  const get = useCallback((user: string) => cache[user], [cache]);

  const value = useMemo(() => ({ get, ensure }), [get, ensure]);
  return (
    <ProfilesContext.Provider value={value}>
      {children}
    </ProfilesContext.Provider>
  );
}

/** Resolve (and lazily fetch) a single user's profile by id. */
export function useProfile(user: string | null | undefined): Profile | undefined {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error("useProfile must be used within <ProfilesProvider>");
  const { get, ensure } = ctx;
  if (user) ensure(user);
  return user ? get(user) : undefined;
}
