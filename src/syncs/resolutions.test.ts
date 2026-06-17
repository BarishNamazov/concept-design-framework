import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import { ForumErrorCode } from "../sdk/error-codes.ts";

let app: TestApp;

beforeEach(async () => {
  if (!app) app = await setupApp();
  await app.reset();
});

afterAll(async () => {
  await app?.stop();
});

async function registerAndLogin(
  username: string,
  displayName = username,
): Promise<{ user: string; session: string }> {
  const { user } = await app.send("/auth/register", {
    username,
    password: "pw",
    displayName,
    email: `${username}@example.com`,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return { user, session };
}

/**
 * Creates a logged-in user, a question post (thread root) and an answer post
 * (a reply to the root), returning their ids.
 */
async function setupQuestionAndAnswer(username: string): Promise<{
  user: string;
  session: string;
  question: string;
  answer: string;
}> {
  const { user, session } = await registerAndLogin(username);
  const thread = await app.send("/threads/create", {
    session,
    content: "How do I do X?",
  });
  const reply = await app.send("/threads/reply", {
    session,
    parent: thread.node,
    content: "You do it like this.",
  });
  return { user, session, question: thread.post, answer: reply.post };
}

describe("resolution synchronizations", () => {
  test("a fresh question is not resolved", async () => {
    const { question } = await setupQuestionAndAnswer("r_alice");
    const res = await app.send("/resolutions/isResolved", { question });
    expect(res.resolved).toBe(false);
  });

  test("the author accepts an answer and the question becomes resolved", async () => {
    const { user, session, question, answer } =
      await setupQuestionAndAnswer("r_bob");

    const accepted = await app.send("/resolutions/accept", {
      session,
      question,
      answer,
    });
    expect(accepted.resolution).toBe(question);

    const resolved = await app.send("/resolutions/isResolved", { question });
    expect(resolved.resolved).toBe(true);

    const got = await app.send("/resolutions/get", { question });
    expect(got.resolution).toHaveLength(1);
    expect(got.resolution[0].answer).toBe(answer);
    expect(got.resolution[0].resolvedBy).toBe(user);
  });

  test("a non-author cannot accept an answer", async () => {
    const { question, answer } = await setupQuestionAndAnswer("r_carol");
    const { session: bobSession } = await registerAndLogin("r_carol_bob");

    const res = await app.send("/resolutions/accept", {
      session: bobSession,
      question,
      answer,
    });
    expect(res.error).toBe(ForumErrorCode.FORBIDDEN);

    const resolved = await app.send("/resolutions/isResolved", { question });
    expect(resolved.resolved).toBe(false);
  });

  test("a non-author cannot clear a resolution", async () => {
    const { session, question, answer } =
      await setupQuestionAndAnswer("r_dave");
    await app.send("/resolutions/accept", { session, question, answer });

    const { session: bobSession } = await registerAndLogin("r_dave_bob");
    const res = await app.send("/resolutions/clear", {
      session: bobSession,
      question,
    });
    expect(res.error).toBe(ForumErrorCode.FORBIDDEN);

    const resolved = await app.send("/resolutions/isResolved", { question });
    expect(resolved.resolved).toBe(true);
  });

  test("the author clears a resolution and the question becomes unresolved", async () => {
    const { session, question, answer } =
      await setupQuestionAndAnswer("r_erin");
    await app.send("/resolutions/accept", { session, question, answer });

    const cleared = await app.send("/resolutions/clear", { session, question });
    expect(cleared.question).toBe(question);

    const resolved = await app.send("/resolutions/isResolved", { question });
    expect(resolved.resolved).toBe(false);

    const got = await app.send("/resolutions/get", { question });
    expect(got.resolution).toEqual([]);
  });

  test("clearing a question with no resolution errors", async () => {
    const { session, question } = await setupQuestionAndAnswer("r_frank");
    const res = await app.send("/resolutions/clear", { session, question });
    expect(res.error).toBeDefined();
  });

  test("accept rejects an invalid session", async () => {
    const { question, answer } = await setupQuestionAndAnswer("r_grace");
    const res = await app.send("/resolutions/accept", {
      session: "nope",
      question,
      answer,
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
  });

  test("clear rejects an invalid session", async () => {
    const { question } = await setupQuestionAndAnswer("r_heidi");
    const res = await app.send("/resolutions/clear", {
      session: "nope",
      question,
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
  });

  test("get returns an empty array for an unresolved question", async () => {
    const { question } = await setupQuestionAndAnswer("r_ivan");
    const res = await app.send("/resolutions/get", { question });
    expect(res.resolution).toEqual([]);
  });
});
