/**
 * Minimal browser demo wiring a tiny UI to the forum backend **through the
 * project's own SDK**. Nothing here hand-rolls a fetch call — every request
 * goes through `createClient(...)`, so the whole flow is the same end-to-end
 * type-safe client a real frontend would use. Bun transpiles this TypeScript
 * (and the imported SDK source) for the browser when `index.html` is served.
 */
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi, Output } from "../src/syncs/app.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const logEl = $("log");
const sessionEl = $("session");
const threadsEl = $<HTMLUListElement>("threads");
const threadEl = $("thread");
const openConvEl = $("openConv");

/** Current session token returned by `/auth/login`, shared across calls. */
let session: string | null = null;
/** The conversation currently opened in section 4. */
let openConversation: string | null = null;
/** The root node of the opened thread; replies attach to a node, not a conversation. */
let openRootNode: string | null = null;

/** Appends a labelled, pretty-printed entry to the on-page log. */
function log(label: string, value: unknown): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent =
    `[${time}] ${label}\n${JSON.stringify(value, null, 2)}\n\n` +
    logEl.textContent;
}

/**
 * Rebuilds the SDK client from the current Base URL field on every action, so
 * the demo can be re-pointed at a different backend without a reload.
 */
function api() {
  return createClient<ForumApi>({
    baseUrl: $<HTMLInputElement>("baseUrl").value.trim(),
  });
}

const val = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id).value;

$("btnRegister").onclick = async () => {
  const res = await api().auth.register({
    username: val("username"),
    password: val("password"),
    displayName: val("displayName"),
  });
  log("POST /auth/register", res);
};

$("btnLogin").onclick = async () => {
  const res = await api().auth.login({
    username: val("username"),
    password: val("password"),
  });
  log("POST /auth/login", res);
  if ("error" in res) return;
  // `res` is now narrowed to the success payload: { session, user }.
  session = String(res.session);
  sessionEl.textContent = session;
};

// Error path: deliberately use a wrong password to show the `{ error }` envelope.
$("btnBadLogin").onclick = async () => {
  const res = await api().auth.login({
    username: val("username"),
    password: "definitely-wrong-password",
  });
  log("POST /auth/login (wrong password)", res);
};

$("btnMe").onclick = async () => {
  if (!session) return log("who am I?", { error: "Not logged in." });
  const res = await api().auth.me({ session });
  log("POST /auth/me", res);
};

$("btnCreate").onclick = async () => {
  if (!session) return log("create thread", { error: "Log in first." });
  const res = await api().threads.create({
    session,
    content: val("threadContent"),
  });
  log("POST /threads/create", res);
};

$("btnList").onclick = async () => {
  const res = await api().threads.list({});
  log("POST /threads/list", res);
  threadsEl.replaceChildren();
  if ("error" in res) return;
  for (const c of res.conversations) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    const firstLine = c.post.content.split("\n")[0] || "(empty)";
    btn.textContent = `${firstLine}  —  ${String(c.conversation).slice(0, 8)}…`;
    btn.onclick = () => openThread(String(c.conversation));
    li.append(btn);
    threadsEl.append(li);
  }
};

/** Opens a conversation via `/threads/get` and renders its post tree. */
async function openThread(conversation: string): Promise<void> {
  openConversation = conversation;
  openConvEl.textContent = conversation;
  const res = await api().threads.get({ conversation });
  log("POST /threads/get", res);
  threadEl.replaceChildren();
  if ("error" in res) return;
  const nodes = res.thread as Output<"/threads/get">["thread"];
  // Replies attach to a node id; use the thread root as the reply target.
  openRootNode = nodes.length ? String(nodes[0].node) : null;
  for (const node of nodes) {
    const div = document.createElement("div");
    div.style.borderLeft = "2px solid #ccc";
    div.style.margin = "0.25rem 0";
    div.style.padding = "0.1rem 0.5rem";
    div.style.marginLeft = `${node.depth}rem`;
    div.textContent = node.post.content;
    threadEl.append(div);
  }
}

$("btnReply").onclick = async () => {
  if (!session) return log("reply", { error: "Log in first." });
  if (!openRootNode) return log("reply", { error: "Open a thread first." });
  const res = await api().threads.reply({
    session,
    parent: openRootNode,
    content: val("replyContent"),
  });
  log("POST /threads/reply", res);
  if (!("error" in res) && openConversation) await openThread(openConversation);
};

log("ready", {
  note: "Demo loaded. Start the backend (bun run start) with CORS allowed.",
  baseUrl: $<HTMLInputElement>("baseUrl").value,
});
