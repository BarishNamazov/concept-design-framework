/**
 * End-to-end SDK tests.
 *
 * These exercise the real client against the *real* application over actual
 * HTTP. We reuse the shared in-memory app from `app_testing.ts` (so Mongo, the
 * concept singletons, and the typed sync composition boot exactly once) and start a second,
 * SDK-facing entry point — the `Requesting` HTTP server — bound to an ephemeral
 * port via the optional `port` argument added to `startRequestingServer`.
 *
 * The file also contains compile-time assertions proving the client's inputs
 * and outputs are inferred from `ApiContract`.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  setupApp,
  startTestServer,
  type TestApp,
  type TestServer,
} from "@utils/app_testing.ts";
import type {
  ApiContract,
  ApiError,
  ID,
  PostView,
  Result,
  ThreadNode,
} from "../syncs/app.ts";
import type { Client } from "./index.ts";
import { createClient } from "./index.ts";

let app: TestApp;
let server: TestServer;
let api: Client<ApiContract>;

beforeEach(async () => {
  if (!app) {
    app = await setupApp();
    // A real HTTP server on an ephemeral port, fronting the shared app.
    server = await startTestServer();
    api = createClient<ApiContract>({ baseUrl: server.baseUrl });
  }
  await app.reset();
});

afterAll(() => {
  // Stop only the HTTP server; the shared Mongo app is torn down by the
  // integration suite that owns its single-shot teardown.
  server?.stop();
});

// --- Test helpers ----------------------------------------------------------

/** Narrows a `Result` to its success branch, failing the test on `{ error }`. */
function ok<T>(result: T | ApiError): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success, got error: ${result.error}`);
  }
  return result as T;
}

/** Registers a user and logs them in, returning their session and id. */
async function makeUser(username: string) {
  const reg = ok(
    await api.auth.register({
      username,
      password: "pw",
      displayName: username,
    }),
  );
  const login = ok(await api.auth.login({ username, password: "pw" }));
  return { user: reg.user, session: login.session };
}

// --- Auth & session --------------------------------------------------------

describe("auth flows", () => {
  test("register -> login -> me", async () => {
    const reg = ok(
      await api.auth.register({
        username: "alice",
        password: "pw",
        displayName: "Alice",
      }),
    );
    expect(reg.user).toBeDefined();

    const login = ok(
      await api.auth.login({ username: "alice", password: "pw" }),
    );
    expect(login.session).toBeDefined();
    expect(login.user).toBe(reg.user);

    const me = ok(await api.auth.me({ session: login.session }));
    expect(me.user).toBe(reg.user);
    expect(me.username).toBe("alice");
    expect(me.profile.displayName).toBe("Alice");

    const out = ok(await api.auth.logout({ session: login.session }));
    expect(out.ok).toBe(true);
  });

  test("invalid session returns an error envelope (not a throw)", async () => {
    const res = await api.auth.me({ session: "nope" });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(typeof res.error).toBe("string");
  });

  test("duplicate registration surfaces the backend error", async () => {
    await api.auth.register({
      username: "bob",
      password: "pw",
      displayName: "Bob",
    });
    const dup = await api.auth.register({
      username: "bob",
      password: "pw2",
      displayName: "Bob2",
    });
    expect("error" in dup).toBe(true);
  });
});

// --- Profiles --------------------------------------------------------------

describe("profile flows", () => {
  test("update display name, bio, avatar then read back", async () => {
    const { user, session } = await makeUser("carol");

    ok(await api.profiles.setDisplayName({ session, displayName: "Carol C" }));
    ok(await api.profiles.setBio({ session, bio: "hello bio" }));
    ok(await api.profiles.setAvatar({ session, avatar: "http://img/a.png" }));

    const got = ok(await api.profiles.get({ user }));
    expect(got.profile.displayName).toBe("Carol C");
    expect(got.profile.bio).toBe("hello bio");
    expect(got.profile.avatar).toBe("http://img/a.png");
  });
});

// --- Threads / posts -------------------------------------------------------

describe("thread & post flows", () => {
  test("create renders markdown, reply, ordered thread, get, edit, delete", async () => {
    const { user, session } = await makeUser("dave");

    const root = ok(await api.threads.create({ session, content: "# Title" }));
    expect(root.post).toBeDefined();
    expect(root.conversation).toBeDefined();
    expect(root.node).toBeDefined();

    // posts/get returns the post record merged with rendered html.
    const view = ok(await api.posts.get({ post: root.post }));
    expect(view.post.content).toBe("# Title");
    expect(view.post.rendered).toContain("<h1>");

    // Two replies under the root node.
    await Bun.sleep(2);
    const reply1 = ok(
      await api.threads.reply({
        session,
        parent: root.node,
        content: "first reply",
      }),
    );
    await Bun.sleep(2);
    const reply2 = ok(
      await api.threads.reply({
        session,
        parent: root.node,
        content: "second reply",
      }),
    );

    const replyLocation = ok(await api.threads.forItem({ item: reply1.post }));
    expect(replyLocation.conversation).toBe(root.conversation);

    const thread = ok(
      await api.threads.get({ conversation: root.conversation }),
    );
    expect(thread.thread.length).toBe(3);
    // Ordered by createdAt ascending: root, reply1, reply2.
    expect(thread.thread[0].item).toBe(root.post);
    expect(thread.thread[1].item).toBe(reply1.post);
    expect(thread.thread[2].item).toBe(reply2.post);
    expect(thread.thread[0].depth).toBe(0);
    expect(thread.thread[1].depth).toBe(1);
    expect(thread.thread[0].post.author).toBe(user);
    expect(thread.thread[0].rendered).toContain("<h1>");

    // Edit the root post.
    const edited = ok(
      await api.posts.edit({ session, post: root.post, content: "# Edited" }),
    );
    expect(edited.post).toBe(root.post);
    const afterEdit = ok(await api.posts.get({ post: root.post }));
    expect(afterEdit.post.content).toBe("# Edited");

    // byAuthor lists this author's posts (root + 2 replies = 3).
    const listed = ok(await api.posts.byAuthor({ author: user }));
    expect(listed.posts.length).toBe(3);
    expect(listed.posts.map((p) => p.post)).toEqual([
      reply2.post,
      reply1.post,
      root.post,
    ]);

    // Delete cascades; byAuthor for a fresh author is an empty array.
    ok(await api.posts.delete({ session, post: reply1.post }));
    const after = ok(await api.posts.byAuthor({ author: user }));
    expect(after.posts.length).toBe(2);

    const empty = ok(await api.posts.byAuthor({ author: "no-such-author" }));
    expect(empty.posts).toEqual([]);
  });

  test("editing another user's post is rejected", async () => {
    const owner = await makeUser("erin");
    const intruder = await makeUser("frank");
    const root = ok(
      await api.threads.create({ session: owner.session, content: "mine" }),
    );
    const res = await api.posts.edit({
      session: intruder.session,
      post: root.post,
      content: "hacked",
    });
    expect("error" in res).toBe(true);
  });

  test("list supports sort param and returns lastActivityAt", async () => {
    const { session } = await makeUser("dave_sort");

    const first = ok(await api.threads.create({ session, content: "first" }));
    const second = ok(await api.threads.create({ session, content: "second" }));

    // Reply to first so it becomes most recently active.
    await Bun.sleep(5);
    ok(
      await api.threads.reply({
        session,
        parent: first.node,
        content: "bump",
      }),
    );

    // Latest sort: second (newer creation) first.
    const latest = ok(await api.threads.list({ sort: "latest" }));
    expect(latest.conversations[0].lastActivityAt).toBeDefined();
    expect(latest.conversations[0].conversation).toBe(second.conversation);

    // Activity sort: first (has a reply) first.
    const activity = ok(await api.threads.list({ sort: "activity" }));
    expect(activity.conversations[0].lastActivityAt).toBeDefined();
    expect(activity.conversations[0].conversation).toBe(first.conversation);

    // The two orders differ.
    expect(latest.conversations[0].conversation).not.toBe(
      activity.conversations[0].conversation,
    );

    // lastActivityAt is a Date string from JSON serialization.
    const dateStr = activity.conversations[0].lastActivityAt;
    expect(typeof dateStr).toBe("string");
    expect(new Date(dateStr as unknown as string).getTime()).not.toBeNaN();
  });
});

// --- Reactions -------------------------------------------------------------

describe("reaction flows", () => {
  test("add, list forTarget, remove", async () => {
    const { user, session } = await makeUser("grace");
    const root = ok(
      await api.threads.create({ session, content: "react to me" }),
    );

    const added = ok(
      await api.reactions.add({ session, target: root.post, kind: "like" }),
    );
    expect(added.reaction).toBeDefined();

    const list = ok(await api.reactions.forTarget({ target: root.post }));
    expect(list.reactions.length).toBe(1);
    expect(list.reactions[0].kind).toBe("like");
    expect(list.reactions[0].user).toBe(user);

    const removed = ok(
      await api.reactions.remove({ session, target: root.post, kind: "like" }),
    );
    expect(removed.ok).toBe(true);

    const empty = ok(await api.reactions.forTarget({ target: root.post }));
    expect(empty.reactions).toEqual([]);
  });
});

// --- Tags ------------------------------------------------------------------

describe("tag flows", () => {
  test("create, add, forTarget, targets, remove", async () => {
    const { session } = await makeUser("heidi");
    const root = ok(await api.threads.create({ session, content: "tag me" }));

    const tag = ok(await api.tags.create({ session, name: "news" }));
    ok(await api.tags.add({ session, target: root.post, tag: tag.tag }));

    const forTarget = ok(await api.tags.forTarget({ target: root.post }));
    expect(forTarget.tags.length).toBe(1);
    expect(forTarget.tags[0].name).toBe("news");
    expect(forTarget.tags[0].tag).toBe(tag.tag);

    const targets = ok(await api.tags.targets({ tag: tag.tag }));
    expect(targets.targets.length).toBe(1);
    expect(targets.targets[0].target).toBe(root.post);

    ok(await api.tags.remove({ session, target: root.post, tag: tag.tag }));
    const after = ok(await api.tags.forTarget({ target: root.post }));
    expect(after.tags).toEqual([]);
  });
});

// --- Unread ----------------------------------------------------------------

describe("unread flows", () => {
  test("list, count, markSeen, markAllSeen", async () => {
    const author = await makeUser("ivan");
    const reader = await makeUser("judy");

    const root = ok(
      await api.threads.create({ session: author.session, content: "topic" }),
    );
    ok(
      await api.threads.reply({
        session: author.session,
        parent: root.node,
        content: "more",
      }),
    );

    const scope = root.conversation;
    const before = ok(
      await api.unread.count({ session: reader.session, scope }),
    );
    expect(before.count).toBe(2);

    const list = ok(await api.unread.list({ session: reader.session, scope }));
    expect(list.items.length).toBe(2);

    ok(
      await api.unread.markSeen({
        session: reader.session,
        item: list.items[0].item,
      }),
    );
    const mid = ok(await api.unread.count({ session: reader.session, scope }));
    expect(mid.count).toBe(1);

    const all = ok(
      await api.unread.markAllSeen({ session: reader.session, scope }),
    );
    expect(all.user).toBe(reader.user);
    const after = ok(
      await api.unread.count({ session: reader.session, scope }),
    );
    expect(after.count).toBe(0);
  });
});

// --- Links -----------------------------------------------------------------

describe("link flows", () => {
  test("forward and backlinks derived from [[..]] references", async () => {
    const { session } = await makeUser("kate");
    const target = ok(
      await api.threads.create({ session, content: "destination" }),
    );
    // A reply whose content references the target post creates a link.
    const source = ok(
      await api.threads.reply({
        session,
        parent: target.node,
        content: `see [[${target.post}]]`,
      }),
    );

    const forward = ok(await api.links.forward({ source: source.post }));
    expect(forward.targets.map((t) => t.target)).toContain(target.post);

    const back = ok(await api.links.backlinks({ target: target.post }));
    expect(back.sources.map((s) => s.source)).toContain(source.post);
  });
});

// --- Indexed call style ----------------------------------------------------

describe("indexed call style", () => {
  test('client["/path"](input) works identically to the grouped style', async () => {
    const reg = ok(
      await api["/auth/register"]({
        username: "leo",
        password: "pw",
        displayName: "Leo",
      }),
    );
    const login = ok(
      await api["/auth/login"]({ username: "leo", password: "pw" }),
    );
    const me = ok(await api["/auth/me"]({ session: login.session }));
    expect(me.user).toBe(reg.user);
    expect(me.username).toBe("leo");
  });
});

// --- Compile-time type assertions -----------------------------------------
//
// These never run; they fail the build if the SDK's inferred types drift from
// `ApiContract`. `Equal`/`Expect` is the standard exact-type-equality trick.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// Grouped and indexed calls infer the same input type from the contract.
type LoginGroupedInput = Parameters<typeof api.auth.login>[0];
type LoginIndexedInput = Parameters<(typeof api)["/auth/login"]>[0];
type _Login1 = Expect<
  Equal<LoginGroupedInput, ApiContract["/auth/login"]["input"]>
>;
type _Login2 = Expect<Equal<LoginGroupedInput, LoginIndexedInput>>;

// Return types resolve to `Result<P>` (success payload | ApiError).
type LoginReturn = Awaited<ReturnType<typeof api.auth.login>>;
type _Login3 = Expect<Equal<LoginReturn, Result<"/auth/login">>>;

// The login success payload carries branded ids for session and user.
type _Login4 = Expect<
  Equal<ApiContract["/auth/login"]["output"], { session: ID; user: ID }>
>;

// posts/get output is the post record plus rendered html.
type PostGetOut = ApiContract["/posts/get"]["output"];
type _Post1 = Expect<Equal<PostGetOut, { post: PostView }>>;
type _Post2 = Expect<
  Equal<
    PostView,
    {
      author: ID;
      content: string;
      createdAt: Date;
      editedAt: Date | null;
      rendered: string;
    }
  >
>;

// threads/get output is a list of enriched nodes.
type ThreadGetOut = ApiContract["/threads/get"]["output"];
type _Thread1 = Expect<Equal<ThreadGetOut, { thread: ThreadNode[] }>>;

// A representative empty-list endpoint keeps its row shape.
type _Tags1 = Expect<
  Equal<
    ApiContract["/tags/forTarget"]["output"],
    { tags: { tag: ID; name: string }[] }
  >
>;

// Reference the alias types so `verbatimModuleSyntax` keeps the imports and the
// assertions above are actually evaluated.
const _typeChecks: [
  _Login1,
  _Login2,
  _Login3,
  _Login4,
  _Post1,
  _Post2,
  _Thread1,
  _Tags1,
] = [true, true, true, true, true, true, true, true];
void _typeChecks;

test("wrong input shapes are rejected by the type-checker", () => {
  // @ts-expect-error — missing required `password`/`displayName`.
  void (() => api.auth.register({ username: "x" }));
  // @ts-expect-error — `/auth/login` takes no `session` field.
  void (() => api["/auth/login"]({ session: "s" }));
  // @ts-expect-error — unknown endpoint.
  void (() => api.auth.nope({}));
  expect(true).toBe(true);
});
