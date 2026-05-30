import { Collection, Db } from "mongodb";
import { freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import { exclusions, inclusions } from "./passthrough.ts";

/**
 * # Requesting concept configuration
 * The following environment variables are available (Bun loads `.env`):
 *
 * - PORT: the port to the server binds, default 8000
 * - REQUESTING_BASE_URL: the base URL prefix for api requests, default "/api"
 * - REQUESTING_TIMEOUT: the timeout for requests, default 10000ms
 * - REQUESTING_SAVE_RESPONSES: whether to persist responses or not, default true
 */
const PORT = parseInt(process.env.PORT ?? "8000", 10);
const REQUESTING_BASE_URL = process.env.REQUESTING_BASE_URL ?? "/api";
const REQUESTING_TIMEOUT = parseInt(
  process.env.REQUESTING_TIMEOUT ?? "10000",
  10,
);

// TODO: make sure you configure this environment variable for proper CORS configuration
const REQUESTING_ALLOWED_DOMAIN = process.env.REQUESTING_ALLOWED_DOMAIN ?? "*";

// Choose whether or not to persist responses
const REQUESTING_SAVE_RESPONSES =
  (process.env.REQUESTING_SAVE_RESPONSES ?? "true") !== "false";

const PREFIX = "Requesting" + ".";

// --- Type Definitions ---
// Internal alias for a Request identifier. Named `RequestID` (rather than
// `Request`) so it doesn't shadow the Web-standard `Request` used by the server.
type RequestID = ID;

/**
 * a set of Requests with
 *   an input unknown
 *   an optional response unknown
 */
interface RequestDoc {
  _id: RequestID;
  input: { path: string; [key: string]: unknown };
  response?: unknown;
  createdAt: Date;
}

/**
 * Represents an in-flight request waiting for a response.
 * This state is not persisted and lives only in memory.
 */
interface PendingRequest {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

/**
 * The Requesting concept encapsulates an API server, modeling incoming
 * requests and outgoing responses as concept actions.
 */
export default class RequestingConcept {
  private readonly requests: Collection<RequestDoc>;
  private readonly pending: Map<RequestID, PendingRequest> = new Map();
  private readonly timeout: number;

  constructor(private readonly db: Db) {
    this.requests = this.db.collection(PREFIX + "requests");
    this.timeout = REQUESTING_TIMEOUT;
    console.log(
      `\nRequesting concept initialized with a timeout of ${this.timeout}ms.`,
    );
  }

  /**
   * request (path: String, ...): (request: Request)
   * System action triggered by an external HTTP request.
   *
   * **requires** true
   *
   * **effects** creates a new Request `r`; sets the input of `r` to be the path and all other input parameters; returns `r` as `request`
   */
  async request(
    inputs: { path: string; [key: string]: unknown },
  ): Promise<{ request: RequestID }> {
    const requestId = freshID() as RequestID;
    const requestDoc: RequestDoc = {
      _id: requestId,
      input: inputs,
      createdAt: new Date(),
    };

    // Persist the request for logging/auditing purposes.
    await this.requests.insertOne(requestDoc);

    // Create an in-memory pending request to manage the async response.
    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pending.set(requestId, { promise, resolve, reject });

    return { request: requestId };
  }

  /**
   * respond (request: Request, [key: string]: unknown)
   *
   * **requires** a Request with the given `request` id exists and has no response yet
   *
   * **effects** sets the response of the given Request to the provided key-value pairs.
   */
  async respond(
    { request, ...response }: { request: RequestID; [key: string]: unknown },
  ): Promise<{ request: string }> {
    const pendingRequest = this.pending.get(request);
    if (pendingRequest) {
      // Resolve the promise for any waiting `_awaitResponse` call.
      pendingRequest.resolve(response);
    }

    // Update the persisted request document with the response.
    if (REQUESTING_SAVE_RESPONSES) {
      await this.requests.updateOne({ _id: request }, { $set: { response } });
    }

    return { request };
  }

  /**
   * _awaitResponse (request: Request): (response: unknown)
   *
   * **effects** returns the response associated with the given request, waiting if necessary up to a configured timeout.
   */
  async _awaitResponse(
    { request }: { request: RequestID },
  ): Promise<{ response: unknown }[]> {
    const pendingRequest = this.pending.get(request);

    if (!pendingRequest) {
      // The request might have been processed already or never existed.
      // We could check the database for a persisted response here if needed.
      throw new Error(
        `Request ${request} is not pending or does not exist: it may have timed-out.`,
      );
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(`Request ${request} timed out after ${this.timeout}ms`),
          ),
        this.timeout,
      );
    });

    try {
      // Race the actual response promise against the timeout.
      const response = await Promise.race([
        pendingRequest.promise,
        timeoutPromise,
      ]);
      return [{ response }];
    } finally {
      // Clean up regardless of outcome.
      clearTimeout(timeoutId!);
      this.pending.delete(request);
    }
  }
}

// --- HTTP server helpers (Bun-native) ---

/**
 * The set of CORS headers applied to every response. The allowed origin is
 * configured via `REQUESTING_ALLOWED_DOMAIN` (default "*"), mirroring the
 * behavior previously provided by `hono/cors`.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": REQUESTING_ALLOWED_DOMAIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Builds a JSON `Response` with the configured CORS headers attached.
 * This keeps every handler terse while guaranteeing consistent headers.
 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * Parses a request body as JSON, returning a fallback when the body is empty
 * or malformed. Passthrough routes default to `{}`; the catch-all instead uses
 * `undefined` to signal "no valid object" so it can answer with a 400.
 */
async function readJsonBody<T>(req: Request, fallback: T): Promise<unknown | T> {
  try {
    const text = await req.text();
    if (text.trim() === "") return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** A registered passthrough route mapping a concept method onto an HTTP path. */
interface PassthroughRoute {
  conceptName: string;
  method: string;
  concept: Record<string, (body: unknown) => Promise<unknown>>;
}

/**
 * Starts the Bun-native web server that listens for incoming requests and pipes
 * them into the Requesting concept instance. Additionally, it allows passthrough
 * requests to concept actions by default. These should be verified intentionally
 * via the inclusions/exclusions in `passthrough.ts`.
 *
 * @param concepts The complete instantiated concepts import from "@concepts"
 * @param options Optional overrides. `port` lets callers (e.g. tests) bind a
 *   specific or ephemeral port (`0` picks a free one); when omitted the `PORT`
 *   environment variable (default 8000) is used, preserving existing behavior.
 * @returns The `Bun.serve` server instance.
 */
export function startRequestingServer(
  concepts: Record<string, any>,
  options: { port?: number } = {},
) {
  const { Requesting, client, db, Engine, ...instances } = concepts;
  if (!(Requesting instanceof RequestingConcept)) {
    throw new Error("Requesting concept missing or broken.");
  }

  /**
   * PASSTHROUGH ROUTES
   *
   * These routes register against every concept action and query.
   * While convenient, you should confirm that they are either intentional
   * inclusions and specify a reason, or if they should be excluded and
   * handled by Requesting instead.
   */

  console.log("\nRegistering concept passthrough routes.");
  const passthrough = new Map<string, PassthroughRoute>();
  let unverified = false;
  for (const [conceptName, concept] of Object.entries(instances)) {
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(concept),
    )
      .filter((name) =>
        name !== "constructor" &&
        typeof (concept as Record<string, unknown>)[name] === "function"
      );
    for (const method of methods) {
      const route = `${REQUESTING_BASE_URL}/${conceptName}/${method}`;
      if (exclusions.includes(route)) continue;
      const included = route in inclusions;
      if (!included) unverified = true;
      const msg = included
        ? `  -> ${route}`
        : `WARNING - UNVERIFIED ROUTE: ${route}`;

      passthrough.set(route, {
        conceptName,
        method,
        concept: concept as PassthroughRoute["concept"],
      });
      console.log(msg);
    }
  }
  const passthroughFile = "./src/concepts/Requesting/passthrough.ts";
  if (unverified) {
    console.log(`FIX: Please verify routes in: ${passthroughFile}`);
  }

  /**
   * Handles a registered passthrough route: reads the JSON body (default `{}`),
   * invokes the concept method, and returns its result as JSON.
   */
  async function handlePassthrough(
    req: Request,
    { conceptName, method, concept }: PassthroughRoute,
  ): Promise<Response> {
    try {
      const body = await readJsonBody(req, {});
      const result = await concept[method](body);
      return json(result);
    } catch (e) {
      console.error(`Error in ${conceptName}.${method}:`, e);
      return json({ error: "An internal server error occurred." }, 500);
    }
  }

  /**
   * REQUESTING ROUTE
   *
   * Handles all POST paths under the base URL that are not passthrough routes.
   * The specific action path is extracted from the URL and combined with the
   * JSON body to form the input to `Requesting.request`.
   */
  async function handleRequesting(
    req: Request,
    pathname: string,
  ): Promise<Response> {
    try {
      const body = await readJsonBody(req, undefined);
      if (typeof body !== "object" || body === null) {
        return json(
          { error: "Invalid request body. Must be a JSON object." },
          400,
        );
      }

      // Extract the specific action path from the request URL.
      // e.g., if base is /api and request is /api/users/create, path is /users/create
      const actionPath = pathname.slice(REQUESTING_BASE_URL.length);

      // Combine the path from the URL with the JSON body to form the action's input.
      const inputs = {
        ...(body as Record<string, unknown>),
        path: actionPath,
      };

      console.log(`[Requesting] Received request for path: ${inputs.path}`);

      // 1. Trigger the 'request' action.
      const { request } = await Requesting.request(inputs);

      // 2. Await the response via the query. This is where the server waits for
      //    synchronizations to trigger the 'respond' action.
      const responseArray = await Requesting._awaitResponse({ request });

      // 3. Send the response back to the client.
      const { response } = responseArray[0];
      return json(response);
    } catch (e) {
      if (e instanceof Error) {
        console.error(`[Requesting] Error processing request:`, e.message);
        if (e.message.includes("timed out")) {
          return json({ error: "Request timed out." }, 504); // Gateway Timeout
        }
        return json({ error: "An internal server error occurred." }, 500);
      } else {
        return json({ error: "unknown error occurred." }, 418);
      }
    }
  }

  const routePath = `${REQUESTING_BASE_URL}/*`;
  console.log(
    `\n🚀 Requesting server listening for POST requests at base path of ${routePath}`,
  );

  return Bun.serve({
    port: options.port ?? PORT,
    async fetch(req: Request): Promise<Response> {
      // Answer CORS preflight requests without touching any handler.
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const { pathname } = new URL(req.url);

      if (req.method === "POST" && pathname.startsWith(REQUESTING_BASE_URL)) {
        const route = passthrough.get(pathname);
        if (route) return handlePassthrough(req, route);
        return handleRequesting(req, pathname);
      }

      return json({ error: "Not found." }, 404);
    },
  });
}
