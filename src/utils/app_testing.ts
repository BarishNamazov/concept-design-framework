import net from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server";

type ConceptsModule = typeof import("@concepts");

/**
 * Boots the full application — every concept and every synchronization — against
 * a disposable in-memory MongoDB, exactly as `main.ts` would against a real one.
 *
 * It injects the database connection through the environment **before** importing
 * the `@concepts` composition module and the typed `@syncs` app composition, so
 * the production singletons (which the synchronizations close over) are wired to
 * the in-memory database. This is what makes the real syncs observable in tests.
 *
 * Because the concept composition is a module singleton, all synchronization
 * integration tests must share a single `setupApp()` (one per test process).
 */
export interface TestApp {
  /**
   * Drives a request end-to-end through the engine just like the HTTP server:
   * fires `Requesting.request` and awaits the matching `Requesting.respond`.
   */
  // biome-ignore lint/suspicious/noExplicitAny: The test helper intentionally preserves loose endpoint payloads for concise assertions.
  send: (path: string, body?: Record<string, unknown>) => Promise<any>;
  /** The instrumented concept singletons (and `Engine`), for direct assertions. */
  concepts: ConceptsModule;
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
 * Process-global resources captured at boot so {@link teardownTestApp} can
 * release them exactly once after the whole test run. The `@concepts`
 * composition binds its Mongo client once at module load (top-level await), so the
 * client and its in-memory server must live for the entire process and never be
 * torn down between suites — otherwise a later suite re-importing the cached
 * module would reuse a closed client or hit a stopped server.
 */
let sharedClient: { close(): Promise<void> } | undefined;
let sharedMongo: { stop(): Promise<unknown> } | undefined;
let sharedHttp: { stop(): void } | undefined;

/**
 * Returns a process-wide singleton app. The app composition is a module
 * singleton, so every integration test in a process must share one instance;
 * isolate individual tests with `reset()` in a `beforeEach` hook.
 */
export function setupApp(): Promise<TestApp> {
  if (shared === undefined) shared = boot();
  return shared;
}

async function boot(): Promise<TestApp> {
  const port = await freeLocalPort();
  const server = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1", port, portGeneration: false },
  });
  process.env.MONGODB_URL = server.getUri();
  process.env.DB_NAME = "app-test";
  process.env.REQUESTING_SAVE_RESPONSES = "false";

  const { Logging } = await import("@engine");
  const concepts = await import("@concepts");
  const syncs = (await import("@syncs")).default;
  concepts.Engine.logging = Logging.OFF;
  concepts.Engine.register(syncs);

  const { Requesting, db, client } = concepts;
  sharedClient = client;
  sharedMongo = server;

  const send = async (path: string, body: Record<string, unknown> = {}) => {
    const { request } = await Requesting.request({ ...body, path });
    const [result] = await Requesting._awaitResponse({ request });
    if ("error" in result) throw new Error(result.error);
    return result.response;
  };

  const reset = async () => {
    for (const c of await db.listCollections().toArray()) {
      await db.collection(c.name).deleteMany({});
    }
  };

  const stop = async () => {
    // Intentionally a no-op. The shared app is a single lifecycle for the whole
    // test process: the `@concepts` composition binds its Mongo client once
    // at module load, so tearing the client/server down here would break any
    // sibling suite that later re-imports the cached module (it would reuse a
    // closed client or hit a stopped server). `teardownTestApp()` — registered
    // as a top-level `afterAll` in the bun test preload — releases everything
    // exactly once after the entire run.
  };

  return { send, concepts, reset, stop };
}

function freeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Unable to reserve a test port.")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
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
  if (sharedServer === undefined) sharedServer = bootServer();
  return sharedServer;
}

async function bootServer(): Promise<TestServer> {
  const app = await setupApp();
  const { startRequestingServer } = await import(
    "@concepts/Requesting/server.ts"
  );
  const server = startRequestingServer(app.concepts, { port: 0 });
  sharedHttp = server;
  const port = server.port ?? 0;
  return {
    baseUrl: `http://localhost:${port}/api`,
    port,
    // No-op for the same reason as `TestApp.stop`: the HTTP server is a
    // process-global singleton; `teardownTestApp()` stops it once after the run.
    stop: () => {},
  };
}

/**
 * Releases the process-global test resources exactly once. Registered as a
 * top-level `afterAll` in the bun test preload (`src/utils/test_preload.ts`), so
 * it runs a single time after the entire run regardless of how many suites
 * booted the shared app. Safe to call when nothing was booted.
 */
export async function teardownTestApp(): Promise<void> {
  sharedHttp?.stop();
  await sharedClient?.close();
  await sharedMongo?.stop();
  shared = undefined;
  sharedServer = undefined;
  sharedClient = undefined;
  sharedMongo = undefined;
  sharedHttp = undefined;
}
