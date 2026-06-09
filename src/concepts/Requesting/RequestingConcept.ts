import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

/**
 * # Requesting concept configuration
 * The following environment variables are available (Bun loads `.env`):
 *
 * - REQUESTING_TIMEOUT: the timeout for requests, default 10000ms
 * - REQUESTING_SAVE_RESPONSES: whether to persist responses or not, default true
 */
const REQUESTING_TIMEOUT = parseInt(
  process.env.REQUESTING_TIMEOUT ?? "10000",
  10,
);

// Choose whether or not to persist responses
const REQUESTING_SAVE_RESPONSES =
  (process.env.REQUESTING_SAVE_RESPONSES ?? "true") !== "false";

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
}

export type AwaitResponseResult = { response: unknown } | { error: string };

/**
 * purpose: reify external requests as concept actions so the wire boundary is
 * expressible as concept behavior.
 */
export default class RequestingConcept {
  private readonly requests: Collection<RequestDoc>;
  private readonly pending: Map<RequestID, PendingRequest> = new Map();
  private readonly timeout: number;

  constructor(
    private readonly db: Db,
    namespace = "Requesting",
  ) {
    this.requests = this.db.collection(collectionName(namespace, "requests"));
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
  async request(inputs: {
    path: string;
    [key: string]: unknown;
  }): Promise<{ request: RequestID }> {
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
    const promise = new Promise<unknown>((res) => {
      resolve = res;
    });

    this.pending.set(requestId, { promise, resolve });

    return { request: requestId };
  }

  /**
   * respond (request: Request, [key: string]: unknown)
   *
   * **requires** a Request with the given `request` id exists and has no response yet
   *
   * **effects** sets the response of the given Request to the provided key-value pairs.
   */
  async respond({
    request,
    ...response
  }: {
    request: RequestID;
    [key: string]: unknown;
  }): Promise<{ request: string }> {
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
  async _awaitResponse({
    request,
  }: {
    request: RequestID;
  }): Promise<AwaitResponseResult[]> {
    const pendingRequest = this.pending.get(request);

    if (!pendingRequest) {
      // The request might have been processed already or never existed.
      // We could check the database for a persisted response here if needed.
      return [
        {
          error: `Request ${request} is not pending or does not exist: it may have timed-out.`,
        },
      ];
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<AwaitResponseResult>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          error: `Request ${request} timed out after ${this.timeout}ms`,
        });
      }, this.timeout);
    });

    try {
      // Race the actual response promise against the timeout.
      const response = await Promise.race([
        pendingRequest.promise.then((value) => ({ response: value })),
        timeoutPromise,
      ]);
      return [response];
    } finally {
      // Clean up regardless of outcome.
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      this.pending.delete(request);
    }
  }
}
