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

/** The global Roling context every forum-wide capability is scoped to. */
export const FORUM_CONTEXT = "forum";

export interface AuthState {
  /** The opaque session token from the last login response, or null when signed out.
   *  Primary auth is via HttpOnly cookie; this is kept for API body compatibility. */
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
    email: string,
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

  const hydrate = useCallback(async () => {
    // Session auth is handled via HttpOnly cookie (credentials: "include").
    // The server extracts session from the cookie and injects it into the
    // request inputs. We pass an empty body — the cookie does the real work.
    const result = await api.auth.me({ session: "" });
    if ("error" in result) {
      setSession(null);
      setMe(null);
      setCan({ administer: false, moderate: false, pin: false });
      return;
    }
    setSession("cookie");
    setMe(result);
    setCan(await resolveCapabilities(String(result.user)));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth hydration must run once on mount
    hydrate().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { session: token } = unwrap(
        await api.auth.login({ username, password }),
      );
      // Primary auth is via HttpOnly cookie set by the server, but we keep
      // the session in memory for API body compatibility.
      setSession(String(token));
      await hydrate();
    },
    [hydrate],
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      displayName: string,
      email: string,
    ) => {
      unwrap(
        await api.auth.register({ username, password, displayName, email }),
      );
      const { session: token } = unwrap(
        await api.auth.login({ username, password }),
      );
      setSession(String(token));
      await hydrate();
    },
    [hydrate],
  );

  const logout = useCallback(async () => {
    // Pass an empty session — the real session is in the HttpOnly cookie.
    // The server clears the cookie via Set-Cookie header.
    if (session) await api.auth.logout({ session: "" });
    setSession(null);
    setMe(null);
    setCan({ administer: false, moderate: false, pin: false });
  }, [session]);

  const refresh = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

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
