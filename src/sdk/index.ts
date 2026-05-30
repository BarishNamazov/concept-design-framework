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
 */
export { createClient } from "./client.ts";
export type {
  Client,
  ClientOptions,
  Endpoint,
  GroupedClient,
  HeadersOption,
  IndexedClient,
} from "./client.ts";
export type {
  ApiContract,
  ApiError,
  ApiPath,
  ID,
  Input,
  Output,
  PostView,
  Result,
  ThreadNode,
} from "./contract.ts";
