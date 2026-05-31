/**
 * Revisioning (post version history) read synchronizations.
 *
 * Revisions are *recorded* by event syncs (see `events.sync.ts`) whenever a
 * post is created or edited; these endpoints expose the resulting history.
 *
 * Endpoints:
 *   POST /revisions/list   { item }         -> { revisions }
 *   POST /revisions/get    { item, number } -> { revision }
 *   POST /revisions/latest { item }         -> { revision }
 */
import { Revisioning } from "@concepts";
import { defineEndpoint, type QueryRow } from "@concepts/Requesting/api.ts";

type RevisionsListOutput = {
  revisions: QueryRow<typeof Revisioning, "_getRevisions">[];
};
type RevisionGetOutput = {
  revision: QueryRow<typeof Revisioning, "_getRevision">[];
};
type RevisionLatestOutput = {
  revision: QueryRow<typeof Revisioning, "_getLatest">[];
};

// --- list: every revision of an item, ascending by number ---

const list = defineEndpoint(
  "/revisions/list",
  ({ Sync, Actions, Request, Respond }) => ({
    RevisionsListResponse: Sync(
      ({ item, revision, number, content, savedAt, revisions }) => ({
        when: Actions(Request({ item })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Revisioning._getRevisions,
            { item },
            { revision, number, content, savedAt },
          );
          return frames.aggregate(
            base,
            [revision, number, content, savedAt],
            revisions,
          );
        },
        then: Actions(Respond<RevisionsListOutput>({ revisions })),
      }),
    ),
  }),
);

// --- get: a specific numbered revision (zero or one) ---

const get = defineEndpoint(
  "/revisions/get",
  ({ Sync, Actions, Request, Respond }) => ({
    RevisionGetResponse: Sync(
      ({ item, number, content, savedAt, revision }) => ({
        when: Actions(Request({ item, number })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Revisioning._getRevision,
            { item, number },
            { content, savedAt },
          );
          return frames.aggregate(base, [content, savedAt], revision);
        },
        then: Actions(Respond<RevisionGetOutput>({ revision })),
      }),
    ),
  }),
);

// --- latest: the highest-numbered revision (zero or one) ---

const latest = defineEndpoint(
  "/revisions/latest",
  ({ Sync, Actions, Request, Respond }) => ({
    RevisionLatestResponse: Sync(
      ({ item, revision, number, content, savedAt, result }) => ({
        when: Actions(Request({ item })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Revisioning._getLatest,
            { item },
            { revision, number, content, savedAt },
          );
          return frames.aggregate(
            base,
            [revision, number, content, savedAt],
            result,
          );
        },
        then: Actions(Respond<RevisionLatestOutput>({ revision: result })),
      }),
    ),
  }),
);

export const revisionsApi = {
  list,
  get,
  latest,
};
