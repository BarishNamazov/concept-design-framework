import {
  buildSetCookieHeaders,
  createRateLimiter,
  SECURITY_HEADERS,
} from "../../http-utils.ts";
import { ForumErrorCode } from "../../sdk/error-codes.ts";
import RequestingConcept from "./RequestingConcept.ts";

/**
 * # Requesting HTTP adapter configuration
 * The following environment variables are available (Bun loads `.env`):
 *
 * - PORT: the port the server binds, default 8000
 * - REQUESTING_BASE_URL: the base URL prefix for api requests, default "/api"
 * - REQUESTING_ALLOWED_DOMAIN: the CORS allowed origin, default "" (block all)
 * - RATE_LIMIT_MAX: max requests per window, default 100
 * - AUTH_RATE_LIMIT_MAX: max auth requests per window per IP, default 5
 * - RATE_LIMIT_WINDOW_MS: rate limit window in ms, default 60000
 */
const PORT = parseInt(process.env.PORT ?? "8000", 10);
const REQUESTING_BASE_URL = process.env.REQUESTING_BASE_URL ?? "/api";

// Default empty string = block all origins by default (secure by default).
const REQUESTING_ALLOWED_DOMAIN = process.env.REQUESTING_ALLOWED_DOMAIN ?? "";

/**
 * Extracts the `session` value from the request's Cookie header, if present.
 */
function extractSessionFromCookie(req: Request): string | undefined {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]*)/);
  return match ? match[1] : undefined;
}

/**
 * The set of CORS headers applied to every response. The allowed origin is
 * configured via `REQUESTING_ALLOWED_DOMAIN` (default ""), mirroring the
 * behavior previously provided by `hono/cors`.
 */
function buildCorsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (REQUESTING_ALLOWED_DOMAIN !== "") {
    headers["Access-Control-Allow-Origin"] = REQUESTING_ALLOWED_DOMAIN;
  }
  return headers;
}

/**
 * Builds a JSON `Response` with the configured CORS and security headers
 * attached. Accepts optional extra headers (e.g. for Set-Cookie).
 */
function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string> | Headers,
): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  for (const [key, value] of Object.entries(buildCorsHeaders())) {
    headers.set(key, value);
  }

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  if (extraHeaders) {
    if (extraHeaders instanceof Headers) {
      for (const [key, value] of extraHeaders.entries()) {
        headers.append(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(extraHeaders)) {
        if (headers.has(key)) {
          headers.append(key, value);
        } else {
          headers.set(key, value);
        }
      }
    }
  }

  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Parses a request body as JSON, returning a fallback when the body is empty
 * or malformed. The Requesting route uses `undefined` as the fallback so it can
 * reject invalid or missing object bodies with a 400.
 */
async function readJsonBody<T>(
  req: Request,
  fallback: T,
): Promise<unknown | T> {
  try {
    const text = await req.text();
    if (text.trim() === "") return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * Extracts the client IP from a Bun server request.
 * Uses the Bun-native `server.requestIP()` when available, otherwise falls
 * back to socket inspection or a placeholder.
 */
function extractClientIp(
  req: Request,
  server: { requestIP?: (req: Request) => { address: string } | null },
): string {
  try {
    if (server.requestIP) {
      const ip = server.requestIP(req);
      if (ip) return ip.address;
    }
  } catch {
    /* fall through */
  }
  try {
    const sock = (req as Request & { socket?: { remoteAddress?: string } })
      .socket;
    return sock?.remoteAddress ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Starts the Bun-native web server that listens for incoming requests and pipes
 * them into the Requesting concept instance. Every POST under the configured
 * base URL becomes a `Requesting.request`; endpoint behavior is provided by
 * explicit synchronizations.
 *
 * @param concepts The complete instantiated concepts import from "@concepts"
 * @param options Optional overrides. `port` lets callers (e.g. tests) bind a
 *   specific or ephemeral port (`0` picks a free one); when omitted the `PORT`
 *   environment variable (default 8000) is used, preserving existing behavior.
 * @returns The `Bun.serve` server instance plus the rate limiter for cleanup.
 */
type RequestingServerConcepts = { Requesting: RequestingConcept } & Record<
  string,
  unknown
>;

export function startRequestingServer(
  concepts: RequestingServerConcepts,
  options: { port?: number } = {},
) {
  const { Requesting } = concepts;
  if (!(Requesting instanceof RequestingConcept)) {
    throw new Error("Requesting concept missing or broken.");
  }

  const rateLimiter = createRateLimiter();

  /**
   * REQUESTING ROUTE
   *
   * Handles all POST paths under the base URL. The specific action path is
   * extracted from the URL and combined with the JSON body and the cookie
   * session to form the input to `Requesting.request`.
   */
  async function handleRequesting(
    req: Request,
    pathname: string,
    ip: string,
  ): Promise<Response> {
    try {
      // Rate limiting (skipped for localhost/unresolvable IPs).
      const skipRateLimit =
        ip === "unknown" || ip === "127.0.0.1" || ip === "::1";
      if (!skipRateLimit && !rateLimiter.check(ip, pathname)) {
        return json({ error: ForumErrorCode.RATE_LIMITED }, 429);
      }

      const body = await readJsonBody(req, undefined);
      if (typeof body !== "object" || body === null) {
        return json({ error: ForumErrorCode.INVALID_BODY }, 400);
      }

      // Extract the specific action path from the request URL.
      // e.g., if base is /api and request is /api/users/create, path is /users/create
      const actionPath = pathname.slice(REQUESTING_BASE_URL.length);

      // Extract session from HttpOnly cookie (server-authoritative).
      const cookieSession = extractSessionFromCookie(req);

      // Combine the path from the URL with the JSON body and cookie session
      // to form the action's input. Cookie session takes precedence over body
      // session for security.
      const inputs = {
        ...(body as Record<string, unknown>),
        path: actionPath,
      } as unknown as { path: string } & Record<string, unknown>;

      if (cookieSession !== undefined) {
        inputs.session = cookieSession;
      }

      console.log(`[Requesting] Received request for path: ${inputs.path}`);

      // 1. Trigger the 'request' action.
      const { request } = await Requesting.request(inputs);

      // 2. Await the response via the query. This is where the server waits for
      //    synchronizations to trigger the 'respond' action.
      const [result] = await Requesting._awaitResponse({ request });

      // 3. Send the response back to the client.
      if ("error" in result) {
        console.error(`[Requesting] Error processing request:`, result.error);
        if (result.error === ForumErrorCode.REQUEST_TIMEOUT) {
          return json({ error: ForumErrorCode.REQUEST_TIMEOUT }, 504);
        }
        return json({ error: ForumErrorCode.INTERNAL_ERROR }, 500);
      }

      // Check for __cookies in the response and build Set-Cookie headers.
      const responseObj = result.response as
        | Record<string, unknown>
        | undefined;
      let cookieHeaders: Headers | undefined;

      if (responseObj?.__cookies) {
        cookieHeaders = buildSetCookieHeaders(
          responseObj.__cookies as Record<string, string>,
          responseObj,
        );
        // Strip __cookies from the response sent to the client.
        delete responseObj.__cookies;
      }

      return json(
        result.response,
        200,
        cookieHeaders ? cookieHeaders : undefined,
      );
    } catch (e) {
      if (e instanceof Error) {
        console.error(`[Requesting] Error processing request:`, e.message);
        return json({ error: ForumErrorCode.INTERNAL_ERROR }, 500);
      }
      return json({ error: ForumErrorCode.INTERNAL_ERROR }, 500);
    }
  }

  const routePath = `${REQUESTING_BASE_URL}/*`;
  console.log(
    `\nRequesting server listening for POST requests at base path of ${routePath}`,
  );

  const server = Bun.serve({
    port: options.port ?? PORT,
    async fetch(
      req: Request,
      srv: { requestIP?: (req: Request) => { address: string } | null },
    ): Promise<Response> {
      const ip = extractClientIp(req, srv);

      // Answer CORS preflight requests without touching any handler.
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: buildCorsHeaders(),
        });
      }

      const { pathname } = new URL(req.url);

      if (req.method === "POST" && pathname.startsWith(REQUESTING_BASE_URL)) {
        return handleRequesting(req, pathname, ip);
      }

      return json({ error: ForumErrorCode.NOT_FOUND }, 404);
    },
  });

  const originalStop = server.stop.bind(server);
  const wrappedStop = async (
    closeActiveConnections?: boolean,
  ): Promise<void> => {
    rateLimiter.cleanup();
    await originalStop(closeActiveConnections);
  };
  server.stop = wrappedStop;

  return server;
}
