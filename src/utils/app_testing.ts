import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Boots the full application — every concept and every synchronization — against
 * a disposable in-memory MongoDB, exactly as `main.ts` would against a real one.
 *
 * It injects the database connection through the environment **before** importing
 * the generated `@concepts`/`@syncs` barrels, so the production singletons (which
 * the synchronizations close over) are wired to the in-memory database. This is
 * what makes the real syncs observable in tests.
 *
 * Because the barrels are module singletons, all synchronization integration
 * tests must share a single `setupApp()` (one per test process). Run
 * `bun run build` first so the barrels exist.
 */
export interface TestApp {
  /**
   * Drives a request end-to-end through the engine just like the HTTP server:
   * fires `Requesting.request` and awaits the matching `Requesting.respond`.
   */
  send: (path: string, body?: Record<string, unknown>) => Promise<any>;
  /** The instrumented concept singletons (and `Engine`), for direct assertions. */
  concepts: Record<string, any>;
  /** Drops every collection so the next test starts from a clean slate. */
  reset: () => Promise<void>;
  /** Tears down the in-memory MongoDB. */
  stop: () => Promise<void>;
}

/**
 * A real HTTP server fronting the shared app via the `Requesting` concept, for
 * tests that need to exercise the API over the wire (e.g. the client SDK).
 */
export interface TestServer {
  /** Base URL including the `/api` prefix, e.g. `http://localhost:1234/api`. */
  baseUrl: string;
  /** The ephemeral port the server bound to. */
  port: number;
  /**
   * Stops the HTTP server only. It deliberately leaves the shared in-memory
   * Mongo (owned by {@link setupApp}) untouched, since that singleton's Mongo
   * client can be closed exactly once per process.
   */
  stop: () => void;
}

let shared: Promise<TestApp> | undefined;
let sharedServer: Promise<TestServer> | undefined;

/**
 * Returns a process-wide singleton app. The generated barrels are module
 * singletons, so every integration test in a process must share one instance;
 * isolate individual tests with `reset()` in a `beforeEach` hook.
 */
export function setupApp(): Promise<TestApp> {
  return (shared ??= boot());
}

async function boot(): Promise<TestApp> {
  const server = await MongoMemoryServer.create();
  process.env.MONGODB_URL = server.getUri();
  process.env.DB_NAME = "forum-test";
  process.env.REQUESTING_SAVE_RESPONSES = "false";

  const { Logging } = await import("@engine");
  const concepts = await import("@concepts");
  const syncs = (await import("@syncs")).default;
  concepts.Engine.logging = Logging.OFF;
  concepts.Engine.register(syncs);

  const { Requesting, db, client } = concepts as any;

  const send = async (path: string, body: Record<string, unknown> = {}) => {
    const { request } = await Requesting.request({ ...body, path });
    const [{ response }] = await Requesting._awaitResponse({ request });
    return response;
  };

  const reset = async () => {
    for (const c of await db.listCollections().toArray()) {
      await db.collection(c.name).deleteMany({});
    }
  };

  const stop = async () => {
    shared = undefined;
    await client.close();
    await server.stop();
  };

  return { send, concepts: concepts as Record<string, any>, reset, stop };
}

/**
 * Starts (once per process) a real `Requesting` HTTP server in front of the
 * shared {@link setupApp} instance and returns its base URL. Bound to an
 * ephemeral port (`0`) so it never clashes with a developer's running app.
 *
 * Tests should stop the returned server in `afterAll` but must **not** stop the
 * shared app here — `setupApp().stop()` owns the single Mongo-client teardown
 * for the whole process.
 */
export function startTestServer(): Promise<TestServer> {
  return (sharedServer ??= bootServer());
}

async function bootServer(): Promise<TestServer> {
  const app = await setupApp();
  const { startRequestingServer } = await import(
    "@concepts/Requesting/RequestingConcept.ts"
  );
  const server = startRequestingServer(app.concepts, { port: 0 });
  const port = server.port ?? 0;
  return {
    baseUrl: `http://localhost:${port}/api`,
    port,
    stop: () => {
      sharedServer = undefined;
      server.stop();
    },
  };
}
