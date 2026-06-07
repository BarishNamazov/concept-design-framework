import { createClient } from "@backend/sdk";
import type { AppApi } from "@backend/syncs/app";

const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export const api = createClient<AppApi>({ baseUrl });

export type { ApiError, AppApi, ID, Result } from "@backend/syncs/app";
