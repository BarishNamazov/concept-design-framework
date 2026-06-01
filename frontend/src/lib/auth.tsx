"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, unwrap } from "@/lib/api";
import type { Me } from "@/lib/models";

const SESSION_KEY = "forum.session";

/** The global Roling context every forum-wide capability is scoped to. */
export const FORUM_CONTEXT = "forum";

export interface AuthState {
  /** The opaque session token, or null when signed out. */
  session: string | null;
  /** The signed-in user's identity + profile, or null. */
  me: Me | null;
  /** True until the initial session restore resolves. */
  loading: boolean;
  /** Forum-wide capability flags, resolved from Roling. */
  can: { administer: boolean; moderate: boolean; pin: boolean };
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads `/auth/me` (e.g. after editing your own profile). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function resolveCapabilities(user: string) {
  const caps = ["administer", "moderate", "pin"] as const;
  const results = await Promise.all(
    caps.map((capability) =>
      api.roles.can({ user, context: FORUM_CONTEXT, capability }),
    ),
  );
  return {
    administer: !("error" in results[0]) && results[0].allowed,
    moderate: !("error" in results[1]) && results[1].allowed,
    pin: !("error" in results[2]) && results[2].allowed,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [can, setCan] = useState({
    administer: false,
    moderate: false,
    pin: false,
  });

  const hydrate = useCallback(async (token: string) => {
    const result = await api.auth.me({ session: token });
    if ("error" in result) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setMe(null);
      setCan({ administer: false, moderate: false, pin: false });
      return;
    }
    setSession(token);
    setMe(result);
    localStorage.setItem(SESSION_KEY, token);
    setCan(await resolveCapabilities(String(result.user)));
  }, []);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(SESSION_KEY)
        : null;
    if (!token) {
      setLoading(false);
      return;
    }
    hydrate(token).finally(() => setLoading(false));
  }, [hydrate]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { session: token } = unwrap(
        await api.auth.login({ username, password }),
      );
      await hydrate(String(token));
    },
    [hydrate],
  );

  const register = useCallback(
    async (username: string, password: string, displayName: string) => {
      unwrap(await api.auth.register({ username, password, displayName }));
      const { session: token } = unwrap(
        await api.auth.login({ username, password }),
      );
      await hydrate(String(token));
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    if (session) await api.auth.logout({ session });
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMe(null);
    setCan({ administer: false, moderate: false, pin: false });
  }, [session]);

  const refresh = useCallback(async () => {
    if (session) await hydrate(session);
  }, [session, hydrate]);

  const value = useMemo<AuthState>(
    () => ({ session, me, loading, can, login, register, logout, refresh }),
    [session, me, loading, can, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth state. Must be used under {@link AuthProvider}. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
