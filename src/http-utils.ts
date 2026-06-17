// ── Session cookie configuration ──

const COOKIE_SECURE = process.env.NODE_ENV === "production" ? "; Secure" : "";

export const SESSION_COOKIE_OPTS =
  `HttpOnly${COOKIE_SECURE}; SameSite=Strict; Path=/; Max-Age=86400` as const;

export const CLEAR_SESSION_COOKIE_OPTS =
  `HttpOnly${COOKIE_SECURE}; SameSite=Strict; Path=/; Max-Age=0` as const;

export function buildSetCookieHeaders(
  cookies: Record<string, string>,
  response: Record<string, unknown>,
): Headers {
  const headers = new Headers();
  for (const [name, opts] of Object.entries(cookies)) {
    const value = response[name] as string | undefined;
    headers.append("Set-Cookie", `${name}=${value ?? ""}; ${opts}`);
  }
  return headers;
}

// ── Security headers ──

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
};

// ── Rate limiting ──

const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS ?? "60000",
  10,
);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10);
const AUTH_RATE_LIMIT_MAX = parseInt(
  process.env.AUTH_RATE_LIMIT_MAX ?? "5",
  10,
);

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check: (ip: string, pathname: string) => boolean;
  cleanup: () => void;
}

export function createRateLimiter(): RateLimiter {
  const entries = new Map<string, RateLimitEntry>();
  let cleanupInterval: ReturnType<typeof setInterval> | undefined;

  function check(ip: string, pathname: string): boolean {
    const isAuthEndpoint = pathname.includes("/auth/");
    const maxRequests = isAuthEndpoint ? AUTH_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
    const key = `${ip}:${pathname}`;
    const now = Date.now();
    const entry = entries.get(key);
    if (!entry || now > entry.resetAt) {
      entries.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }
    if (entry.count >= maxRequests) return false;
    entry.count++;
    return true;
  }

  function cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now > entry.resetAt) entries.delete(key);
    }
  }

  function startCleanup(): void {
    cleanupInterval = setInterval(cleanup, 5 * 60 * 1000);
  }

  startCleanup();

  return {
    check,
    cleanup: () => {
      if (cleanupInterval !== undefined) clearInterval(cleanupInterval);
    },
  };
}
