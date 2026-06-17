/** Self-contained, generic Requesting client SDK. */

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
export { createClient } from "./client.ts";
export type { ApiError as StructuredApiError } from "./error-codes.ts";
export { ForumErrorCode, isApiError } from "./error-codes.ts";
