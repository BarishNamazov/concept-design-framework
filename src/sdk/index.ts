/**
 * # Forum client SDK
 *
 * Barrel module for the type-safe client. Import everything a frontend needs
 * from here:
 *
 * ```ts
 * import { createClient } from "@/sdk"; // or a relative path
 * import type { ApiContract, Result } from "@/sdk";
 * ```
 *
 * The generic Proxy client lives in `client.ts` and is app-agnostic; here we
 * bind it to the app's aggregated `ApiContract` (assembled from the syncs by
 * `bun run build`) so `createClient()` needs no type argument.
 */
import { createClient as createGenericClient } from "./client.ts";
import type { Client, ClientOptions } from "./client.ts";
import type { ApiContract } from "./contract.ts";

/**
 * Creates a typed API client bound to the forum's aggregated {@link ApiContract}.
 * Supports both the grouped (`api.auth.login(...)`) and indexed
 * (`api["/auth/login"](...)`) calling styles, each fully inferred from the
 * contract. Methods never throw; each resolves to its success payload or an
 * `{ error }` envelope.
 */
export function createClient(options: ClientOptions = {}): Client<ApiContract> {
  return createGenericClient<ApiContract>(options);
}

export type {
  ApiError,
  Client,
  ClientOptions,
  ContractShape,
  Endpoint,
  GroupedClient,
  HeadersOption,
  IndexedClient,
} from "./client.ts";
export type {
  ApiContract,
  ApiPath,
  ID,
  Input,
  Output,
  PostView,
  Result,
  ThreadNode,
} from "./contract.ts";
