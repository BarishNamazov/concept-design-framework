"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h1 className="text-4xl font-bold tracking-tight">Welcome</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Concept-design application template with authentication, profiles, and
        role-based authorization.
      </p>
      {!loading && !user ? (
        <div className="mt-8 flex gap-4">
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Create account
          </Link>
        </div>
      ) : null}
    </div>
  );
}
