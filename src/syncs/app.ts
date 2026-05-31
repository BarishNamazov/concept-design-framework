import {
  type ApiError,
  type ContractOf,
  syncMap,
} from "@concepts/Requesting/api.ts";
import type { ID } from "@utils/types.ts";
import { authApi } from "./auth.sync.ts";
import { bookmarksApi } from "./bookmarks.sync.ts";
import { categoriesApi } from "./categories.sync.ts";
import { eventSyncs } from "./events.sync.ts";
import { flagsApi } from "./flags.sync.ts";
import { linksApi } from "./links.sync.ts";
import { locksApi } from "./locks.sync.ts";
import { notificationsApi } from "./notifications.sync.ts";
import { pinsApi } from "./pins.sync.ts";
import { profilesApi } from "./profiles.sync.ts";
import { reactionsApi } from "./reactions.sync.ts";
import { resolutionsApi } from "./resolutions.sync.ts";
import { revisionsApi } from "./revisions.sync.ts";
import { rolesApi } from "./roles.sync.ts";
import { subscriptionsApi } from "./subscriptions.sync.ts";
import { tagsApi } from "./tags.sync.ts";
import { postsApi, threadsApi } from "./threads.sync.ts";
import { trashApi } from "./trash.sync.ts";
import { unreadApi } from "./unread.sync.ts";

export const api = {
  auth: authApi,
  links: linksApi,
  profiles: profilesApi,
  reactions: reactionsApi,
  tags: tagsApi,
  threads: threadsApi,
  posts: postsApi,
  unread: unreadApi,
  roles: rolesApi,
  notifications: notificationsApi,
  flags: flagsApi,
  trash: trashApi,
  categories: categoriesApi,
  resolutions: resolutionsApi,
  pins: pinsApi,
  subscriptions: subscriptionsApi,
  bookmarks: bookmarksApi,
  locks: locksApi,
  revisions: revisionsApi,
};

export const syncs = {
  ...syncMap(api),
  ...eventSyncs,
};

export default syncs;

export type ForumApi = ContractOf<typeof api>;
export type ApiContract = ForumApi;
export type ApiPath = keyof ForumApi & string;
export type Input<P extends ApiPath> = ForumApi[P]["input"];
export type Output<P extends ApiPath> = ForumApi[P]["output"];
export type Result<P extends ApiPath> = Output<P> | ApiError;

export type ThreadNode = Output<"/threads/get">["thread"][number];
export type PostView = Output<"/posts/get">["post"];

export type { ApiError, ID };
