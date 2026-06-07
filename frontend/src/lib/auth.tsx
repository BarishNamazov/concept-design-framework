"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface User {
  user: string;
  username: string;
  session: string;
  profile: {
    displayName: string;
    bio: string;
    avatar: string;
  };
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  register: (
    username: string,
    password: string,
    displayName: string,
  ) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const SESSION_KEY = "session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveMe = async (session: string) => {
    const result = await api.auth.me({ session });
    if ("error" in result) return null;
    const { user: userId, username, profile } = result;
    return { user: userId, username, session, profile };
  };

  const refresh = async () => {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }
    const u = await resolveMe(session);
    if (u) {
      setUser(u);
    } else {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
    }
    setLoading(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only session check
  useEffect(() => {
    refresh();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.auth.login({ username, password });
    if ("error" in res) return res.error;
    localStorage.setItem(SESSION_KEY, res.session);
    const u = await resolveMe(res.session);
    setUser(u);
    return null;
  };

  const register = async (
    username: string,
    password: string,
    displayName: string,
  ) => {
    const res = await api.auth.register({ username, password, displayName });
    if ("error" in res) return res.error;
    const loginRes = await api.auth.login({ username, password });
    if ("error" in loginRes) return loginRes.error;
    localStorage.setItem(SESSION_KEY, loginRes.session);
    const u = await resolveMe(loginRes.session);
    setUser(u);
    return null;
  };

  const logout = async () => {
    if (user) {
      await api.auth.logout({ session: user.session });
    }
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
