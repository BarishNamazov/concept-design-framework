/**
 * Resolution (accepted-answer marking) synchronizations.
 *
 * Endpoints:
 *   POST /resolutions/accept     { session, question, answer } -> { resolution }
 *   POST /resolutions/clear      { session, question }         -> { question }
 *   POST /resolutions/get        { question }                  -> { resolution }
 *   POST /resolutions/isResolved { question }                  -> { resolved }
 */
import { Posting, Resolving, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type ResolutionAcceptOutput = ActionOk<typeof Resolving, "accept">;
type ResolutionGetOutput = {
  resolution: QueryRow<typeof Resolving, "_getResolution">[];
};
type ResolutionIsResolvedOutput = { resolved: boolean };

// --- accept (author-only on the question post) ---

const accept = defineEndpoint(
  "/resolutions/accept",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    ResolutionAcceptRequest: Sync(
      ({ session, question, answer, user, author }) => ({
        when: Actions(Request({ session, question, answer })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Posting._getAuthor,
            { post: question },
            { author },
          );
          return frames.filter(($) => $[author] === $[user]);
        },
        then: Actions([Resolving.accept, { question, answer, by: user }]),
      }),
    ),

    ResolutionAcceptResponse: Sync(({ resolution }) => ({
      when: Actions([Resolving.accept, {}, { resolution }]),
      then: Actions(Respond<ResolutionAcceptOutput>({ resolution })),
    })),

    ResolutionAcceptError: Sync(({ error }) => ({
      when: Actions([Resolving.accept, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    ResolutionAcceptNotAuthor: Sync(({ session, question, user, author }) => ({
      when: Actions(Request({ session, question })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Posting._getAuthor,
          { post: question },
          { author },
        );
        return frames.filter(($) => $[author] !== $[user]);
      },
      then: Actions(
        Fail("Not authorized to accept an answer for this question."),
      ),
    })),

    ResolutionAcceptInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- clear (author-only on the question post) ---

const clear = defineEndpoint(
  "/resolutions/clear",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    ResolutionClearRequest: Sync(({ session, question, user, author }) => ({
      when: Actions(Request({ session, question })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Posting._getAuthor,
          { post: question },
          { author },
        );
        return frames.filter(($) => $[author] === $[user]);
      },
      then: Actions([Resolving.clear, { question }]),
    })),

    ResolutionClearResponse: Sync(({ question }) => ({
      when: Actions([Resolving.clear, {}, { question }]),
      then: Actions(Respond<{ question: string }>({ question })),
    })),

    ResolutionClearError: Sync(({ error }) => ({
      when: Actions([Resolving.clear, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    ResolutionClearNotAuthor: Sync(({ session, question, user, author }) => ({
      when: Actions(Request({ session, question })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Posting._getAuthor,
          { post: question },
          { author },
        );
        return frames.filter(($) => $[author] !== $[user]);
      },
      then: Actions(
        Fail("Not authorized to clear an answer for this question."),
      ),
    })),

    ResolutionClearInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- get: public, zero-or-one aggregated into a list ---

const get = defineEndpoint(
  "/resolutions/get",
  ({ Sync, Actions, Request, Respond }) => ({
    ResolutionGetResponse: Sync(
      ({ question, answer, resolvedBy, resolvedAt, resolution }) => ({
        when: Actions(Request({ question })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Resolving._getResolution,
            { question },
            { answer, resolvedBy, resolvedAt },
          );
          return frames.aggregate(
            base,
            [answer, resolvedBy, resolvedAt],
            resolution,
          );
        },
        then: Actions(Respond<ResolutionGetOutput>({ resolution })),
      }),
    ),
  }),
);

// --- isResolved: public single-row ---

const isResolved = defineEndpoint(
  "/resolutions/isResolved",
  ({ Sync, Actions, Request, Respond }) => ({
    ResolutionIsResolvedResponse: Sync(({ question, resolved }) => ({
      when: Actions(Request({ question })),
      where: async (frames) =>
        await frames.query(Resolving._isResolved, { question }, { resolved }),
      then: Actions(Respond<ResolutionIsResolvedOutput>({ resolved })),
    })),
  }),
);

export const resolutionsApi = {
  accept,
  clear,
  get,
  isResolved,
};
