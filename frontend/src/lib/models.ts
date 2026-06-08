/**
 * Named view-model types projected out of the backend's endpoint outputs.
 *
 * These never restate field shapes by hand — they are slices of `Output<P>`, so
 * if the backend contract changes, these types (and every component that uses
 * them) update automatically.
 */
import type { Output } from "./api";

type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

/** One row of the home feed (`/threads/list`). */
export type ConversationSummary = ArrayElement<
  Output<"/threads/list">["conversations"]
>;

/** One enriched node of a thread tree (`/threads/get`). */
export type ThreadNode = ArrayElement<Output<"/threads/get">["thread"]>;

/** A single post with rendered HTML (`/posts/get`). */
export type PostView = Output<"/posts/get">["post"];

/** The authenticated user's identity + profile (`/auth/me`). */
export type Me = Output<"/auth/me">;

/** A public profile (`/profiles/get`). */
export type Profile = Output<"/profiles/get">["profile"];

export type Reaction = ArrayElement<Output<"/reactions/forTarget">["reactions"]>;
export type Tag = ArrayElement<Output<"/tags/forTarget">["tags"]>;
export type Category = ArrayElement<Output<"/categories/list">["categories"]>;
export type Notification = ArrayElement<
  Output<"/notifications/list">["notifications"]
>;
export type Flag = ArrayElement<Output<"/flags/forTarget">["flags"]>;
export type OpenFlag = ArrayElement<Output<"/flags/open">["targets"]>;
export type TrashedItem = ArrayElement<Output<"/trash/list">["trashed"]>;
export type Bookmark = ArrayElement<Output<"/bookmarks/list">["bookmarks"]>;
export type Subscription = ArrayElement<
  Output<"/subscriptions/mine">["subscriptions"]
>;
export type Revision = ArrayElement<Output<"/revisions/list">["revisions"]>;
export type LockedTarget = ArrayElement<Output<"/locks/list">["locked"]>;
export type PinnedItem = ArrayElement<Output<"/pins/forScope">["pinned"]>;
export type RoleRow = ArrayElement<Output<"/roles/forUser">["roles"]>;
export type RoleDetail = Output<"/roles/get">;
export type RoleSummary = ArrayElement<Output<"/roles/list">["roles"]>;

/** A loosely-typed id alias mirroring the backend's branded `ID`. */
export type ID = string;
