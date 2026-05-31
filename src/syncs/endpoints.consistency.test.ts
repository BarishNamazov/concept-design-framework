import { beforeAll, expect, test } from "bun:test";
import type { EmptyInput } from "@concepts/Requesting/api.ts";
import type { ActionPattern, Sync } from "@engine";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import type { ID } from "@utils/types.ts";
import { $vars } from "../engine/vars.ts";
import type { ForumApi } from "./app.ts";

let app: TestApp;
let api: typeof import("./app.ts")["api"];
let requestAction: unknown;
let respondAction: unknown;

beforeAll(async () => {
  app = await setupApp();
  ({ api } = await import("./app.ts"));
  const Requesting = app.concepts.Requesting;
  requestAction = Requesting.request;
  respondAction = Requesting.respond;
});

interface EndpointRuntime {
  path: string;
  syncs: Record<string, Sync>;
}

function collectEndpoints(value: unknown): EndpointRuntime[] {
  if (isEndpoint(value)) return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectEndpoints);
}

function isEndpoint(value: unknown): value is EndpointRuntime {
  return (
    value !== null &&
    typeof value === "object" &&
    "path" in value &&
    "syncs" in value
  );
}

test("every typed endpoint is backed by coherent Requesting syncs", () => {
  const endpoints = collectEndpoints(api);
  expect(endpoints.length).toBeGreaterThan(0);

  for (const endpoint of endpoints) {
    let responds = false;
    const seenPaths = new Set<string>();

    for (const sync of Object.values(endpoint.syncs)) {
      const declaration = sync($vars);
      for (const pattern of declaration.when as ActionPattern[]) {
        if (pattern.action !== requestAction) continue;
        if (typeof pattern.input.path === "string") {
          seenPaths.add(pattern.input.path);
        }
      }
      responds ||= (declaration.then as ActionPattern[]).some(
        (pattern) => pattern.action === respondAction,
      );
    }

    expect([...seenPaths].sort()).toEqual([endpoint.path]);
    expect(responds).toBe(true);
  }
});

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type ExpectedPaths =
  | "/auth/register"
  | "/auth/login"
  | "/auth/logout"
  | "/auth/me"
  | "/auth/changePassword"
  | "/profiles/get"
  | "/profiles/setDisplayName"
  | "/profiles/setBio"
  | "/profiles/setAvatar"
  | "/threads/create"
  | "/threads/reply"
  | "/threads/get"
  | "/threads/list"
  | "/posts/get"
  | "/posts/edit"
  | "/posts/delete"
  | "/posts/byAuthor"
  | "/reactions/add"
  | "/reactions/remove"
  | "/reactions/forTarget"
  | "/tags/create"
  | "/tags/add"
  | "/tags/remove"
  | "/tags/targets"
  | "/tags/forTarget"
  | "/unread/list"
  | "/unread/count"
  | "/unread/markSeen"
  | "/unread/markAllSeen"
  | "/links/backlinks"
  | "/links/forward"
  | "/roles/define"
  | "/roles/grant"
  | "/roles/revoke"
  | "/roles/forUser"
  | "/roles/can"
  | "/notifications/list"
  | "/notifications/unreadCount"
  | "/notifications/markRead"
  | "/notifications/markAllRead"
  | "/notifications/dismiss"
  | "/flags/raise"
  | "/flags/resolve"
  | "/flags/open"
  | "/flags/forTarget"
  | "/trash/trash"
  | "/trash/restore"
  | "/trash/purge"
  | "/trash/list"
  | "/trash/isTrashed"
  | "/categories/create"
  | "/categories/delete"
  | "/categories/assign"
  | "/categories/unassign"
  | "/categories/list"
  | "/categories/items"
  | "/categories/forItem"
  | "/resolutions/accept"
  | "/resolutions/clear"
  | "/resolutions/get"
  | "/resolutions/isResolved"
  | "/pins/pin"
  | "/pins/unpin"
  | "/pins/setPriority"
  | "/pins/forScope"
  | "/pins/isPinned"
  | "/subscriptions/subscribe"
  | "/subscriptions/unsubscribe"
  | "/subscriptions/mine"
  | "/subscriptions/subscribers"
  | "/subscriptions/isSubscribed"
  | "/bookmarks/save"
  | "/bookmarks/unsave"
  | "/bookmarks/list"
  | "/bookmarks/isSaved"
  | "/locks/lock"
  | "/locks/unlock"
  | "/locks/isLocked"
  | "/locks/list"
  | "/revisions/list"
  | "/revisions/get"
  | "/revisions/latest";

type _PathSet = Expect<Equal<keyof ForumApi, ExpectedPaths>>;
type _LoginInput = Expect<
  Equal<
    ForumApi["/auth/login"]["input"],
    { username: string; password: string }
  >
>;
type _RegisterInput = Expect<
  Equal<
    ForumApi["/auth/register"]["input"],
    { username: string; password: string; displayName: string }
  >
>;
type _ThreadListInput = Expect<
  Equal<ForumApi["/threads/list"]["input"], EmptyInput>
>;
type _ThreadCreateOutput = Expect<
  Equal<
    ForumApi["/threads/create"]["output"],
    { post: ID; conversation: ID; node: ID }
  >
>;

const _typeChecks: [
  _PathSet,
  _LoginInput,
  _RegisterInput,
  _ThreadListInput,
  _ThreadCreateOutput,
] = [true, true, true, true, true];
void _typeChecks;
