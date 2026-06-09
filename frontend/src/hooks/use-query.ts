"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "@/lib/api";

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-runs the loader, keeping previous data visible until it resolves. */
  refetch: () => void;
}

/**
 * Minimal data hook over the SDK. Runs `loader` whenever a dependency in `deps`
 * changes, tracks loading/error, ignores stale resolutions, and treats the
 * backend's `{ error }` envelope as an error. Pass `loader = null` to stay idle
 * (e.g. a request that needs a session that isn't ready yet).
 */
export function useQuery<T>(
  loader: (() => Promise<T | { error: string }>) | null,
  deps: ReadonlyArray<unknown>,
): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(loader !== null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: callers provide the dependency list that controls loader refreshes; nonce intentionally forces refetch.
  useEffect(() => {
    if (!loader) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (id !== reqId.current) return;
        if (isApiError(result)) {
          setError(result.error);
        } else {
          setData(result as T);
        }
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, refetch };
}
