"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingState } from "@/components/forum/states";
import { useAuth } from "@/lib/auth";

/**
 * Gates its children behind an active session. While the session is restoring
 * it shows a loader; if unauthenticated it redirects to `/login`.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!me) return <LoadingState label="Redirecting to sign in…" />;
  return <>{children}</>;
}
