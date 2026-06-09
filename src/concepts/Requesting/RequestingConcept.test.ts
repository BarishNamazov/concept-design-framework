import { afterAll, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";

/**
 * These tests cover the `RequestingConcept` class (the request/respond/await
 * lifecycle) as well as the Bun-native HTTP adapter returned by
 * `startRequestingServer`.
 *
 * Environment configuration is read at module load time inside
 * `RequestingConcept.ts`, so any env var that must differ from the defaults is
 * set *before* importing the module. We pick an uncommon `PORT` and disable
 * response persistence to keep the suite deterministic and free of noise.
 */
process.env.REQUESTING_SAVE_RESPONSES = "false";
process.env.PORT = "8753";

const { default: RequestingConcept } = await import("./RequestingConcept.ts");
const { startRequestingServer } = await import("./server.ts");

const mongo = await setupTestDb();
afterAll(() => mongo.stop());

describe("RequestingConcept lifecycle", () => {
  test("request -> respond -> _awaitResponse resolves with payload", async () => {
    const Requesting = new RequestingConcept(mongo.db);

    const { request } = await Requesting.request({
      path: "/posts/create",
      content: "hello",
    });
    expect(typeof request).toBe("string");

    // Respond before awaiting; the pending promise is resolved in place.
    await Requesting.respond({ request, ok: true, value: 42 });

    const result = await Requesting._awaitResponse({ request });
    expect(result).toEqual([{ response: { ok: true, value: 42 } }]);
  });

  test("respond then await also works when await happens first", async () => {
    const Requesting = new RequestingConcept(mongo.db);
    const { request } = await Requesting.request({ path: "/x" });

    // Kick off the await, then respond asynchronously.
    const awaiting = Requesting._awaitResponse({ request });
    await Requesting.respond({ request, done: true });

    expect(await awaiting).toEqual([{ response: { done: true } }]);
  });

  test("_awaitResponse for an unknown request returns an error", async () => {
    const Requesting = new RequestingConcept(mongo.db);
    expect(
      await Requesting._awaitResponse({ request: "does-not-exist" as ID }),
    ).toEqual([
      {
        error: expect.stringContaining("not pending or does not exist"),
      },
    ]);
  });

  test("_awaitResponse returns a timeout error when no response arrives", async () => {
    // The timeout is captured at construction, so set it small beforehand.
    const previous = process.env.REQUESTING_TIMEOUT;
    process.env.REQUESTING_TIMEOUT = "50";
    // A non-literal specifier with a cache-busting query forces Bun to
    // re-evaluate the module so the new REQUESTING_TIMEOUT is picked up.
    const spec = "./RequestingConcept.ts?timeout-test";
    const { default: FreshRequesting } = await import(spec);
    const Requesting = new FreshRequesting(mongo.db);

    const { request } = await Requesting.request({ path: "/never" });
    expect(await Requesting._awaitResponse({ request })).toEqual([
      {
        error: expect.stringContaining("timed out"),
      },
    ]);

    if (previous === undefined) delete process.env.REQUESTING_TIMEOUT;
    else process.env.REQUESTING_TIMEOUT = previous;
  });
});

describe("startRequestingServer (Bun.serve HTTP round-trip)", () => {
  test("catch-all request, CORS, and 404", async () => {
    const Requesting = new RequestingConcept(mongo.db);

    // The catch-all path drives Requesting.request and waits for a respond.
    // We simulate a synchronization by responding as soon as a request lands.
    const originalRequest = Requesting.request.bind(Requesting);
    Requesting.request = async (inputs) => {
      const result = await originalRequest(inputs);
      // Respond on the next tick, echoing the received path back.
      queueMicrotask(() => {
        void Requesting.respond({
          request: result.request,
          path: inputs.path,
          handled: true,
        });
      });
      return result;
    };

    const server = startRequestingServer(
      {
        Requesting,
        db: mongo.db,
        client: mongo.client,
        Engine: {},
      },
      { port: 0 },
    );

    const base = `http://localhost:${server.port}/api`;

    try {
      // 1. Catch-all path flows through Requesting.request/_awaitResponse.
      const catchRes = await fetch(`${base}/posts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "t" }),
      });
      expect(catchRes.status).toBe(200);
      expect(await catchRes.json()).toEqual({
        path: "/posts/create",
        handled: true,
      });

      // 2. Invalid (non-object) body yields a 400.
      const badRes = await fetch(`${base}/posts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "5",
      });
      expect(badRes.status).toBe(400);
      expect(await badRes.json()).toEqual({
        error: "Invalid request body. Must be a JSON object.",
      });

      // 3. CORS preflight is answered with 204 + headers.
      const preflight = await fetch(`${base}/posts/create`, {
        method: "OPTIONS",
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

      // 4. Unmatched routes return 404.
      const notFound = await fetch(`http://localhost:${server.port}/`, {
        method: "GET",
      });
      expect(notFound.status).toBe(404);
    } finally {
      server.stop(true);
    }
  });
});
