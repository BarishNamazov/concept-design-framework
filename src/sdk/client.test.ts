/**
 * End-to-end SDK tests.
 *
 * These exercise the real client against the *real* application over actual
 * HTTP. We reuse the shared in-memory app from `app_testing.ts` and start a
 * `Requesting` HTTP server bound to an ephemeral port.
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
import type { ApiContract, ApiError, ID, Result } from "../syncs/app.ts";
import type { Client } from "./index.ts";
import { createClient } from "./index.ts";

let app: TestApp;
let server: TestServer;
let api: Client<ApiContract>;

beforeEach(async () => {
  if (!app) {
    app = await setupApp();
    server = await startTestServer();
    api = createClient<ApiContract>({ baseUrl: server.baseUrl });
  }
  await app.reset();
});

afterAll(() => {
  server?.stop();
});

function ok<T>(result: T | ApiError): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success, got error: ${result.error}`);
  }
  return result as T;
}

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

describe("role flows", () => {
  test("first registered user can define, grant, and query roles", async () => {
    const { session, user } = await makeUser("admin");

    // First user is auto-granted admin capability in the app context.
    const canCheck = ok(
      await api.roles.can({ user, context: "app", capability: "administer" }),
    );
    expect(canCheck.allowed).toBe(true);

    const role = ok(
      await api.roles.define({
        session,
        name: "editor",
        capabilities: "edit",
      }),
    );
    expect(role.role).toBeDefined();

    const grant = ok(
      await api.roles.grant({
        session,
        user,
        context: "app",
        role: role.role,
      }),
    );
    expect(grant.grant).toBeDefined();
  });

  test("second user cannot manage roles", async () => {
    await makeUser("admin");
    const { session } = await makeUser("normal");

    const res = await api.roles.define({
      session,
      name: "hacker",
      capabilities: "x",
    });
    expect("error" in res).toBe(true);
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

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type LoginGroupedInput = Parameters<typeof api.auth.login>[0];
type LoginIndexedInput = Parameters<(typeof api)["/auth/login"]>[0];
type _Login1 = Expect<
  Equal<LoginGroupedInput, ApiContract["/auth/login"]["input"]>
>;
type _Login2 = Expect<Equal<LoginGroupedInput, LoginIndexedInput>>;

type LoginReturn = Awaited<ReturnType<typeof api.auth.login>>;
type _Login3 = Expect<Equal<LoginReturn, Result<"/auth/login">>>;

type _Login4 = Expect<
  Equal<ApiContract["/auth/login"]["output"], { session: ID; user: ID }>
>;

const _typeChecks: [_Login1, _Login2, _Login3, _Login4] = [
  true,
  true,
  true,
  true,
];
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
