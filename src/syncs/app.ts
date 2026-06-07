import {
  type ApiError,
  type ContractOf,
  syncMap,
} from "@concepts/Requesting/api.ts";
import type { ID } from "@utils/types.ts";
import { authApi, InvalidSession } from "./auth.sync.ts";
import { profilesApi } from "./profiles.sync.ts";
import { rolesApi } from "./roles.sync.ts";

export const api = {
  auth: authApi,
  profiles: profilesApi,
  roles: rolesApi,
};

export const syncs = {
  ...syncMap(api),
  InvalidSession,
};

export default syncs;

export type AppApi = ContractOf<typeof api>;
export type ApiContract = AppApi;
export type ApiPath = keyof AppApi & string;
export type Input<P extends ApiPath> = AppApi[P]["input"];
export type Output<P extends ApiPath> = AppApi[P]["output"];
export type Result<P extends ApiPath> = Output<P> | ApiError;

export type { ApiError, ID };
