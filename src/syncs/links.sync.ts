/**
 * Link synchronizations.
 *
 * Endpoints:
 *   POST /links/backlinks { target } -> { sources }
 *   POST /links/forward   { source } -> { targets }
 */
import { Linking } from "@concepts";
import { defineEndpoint, type QueryRow } from "@concepts/Requesting/api.ts";

type BacklinksOutput = {
  sources: QueryRow<typeof Linking, "_getBacklinks">[];
};
type ForwardOutput = {
  targets: QueryRow<typeof Linking, "_getForwardLinks">[];
};

// --- backlinks: public ---

const backlinks = defineEndpoint(
  "/links/backlinks",
  ({ Sync, Actions, Request, Respond }) => ({
    LinkBacklinksResponse: Sync(({ target, source, sources }) => ({
      when: Actions(Request({ target })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Linking._getBacklinks,
          { target },
          { source },
        );
        return frames.aggregate(base, [source], sources);
      },
      then: Actions(Respond<BacklinksOutput>({ sources })),
    })),
  }),
);

// --- forward: public ---

const forward = defineEndpoint(
  "/links/forward",
  ({ Sync, Actions, Request, Respond }) => ({
    LinkForwardResponse: Sync(({ source, target, targets }) => ({
      when: Actions(Request({ source })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Linking._getForwardLinks,
          { source },
          { target },
        );
        return frames.aggregate(base, [target], targets);
      },
      then: Actions(Respond<ForwardOutput>({ targets })),
    })),
  }),
);

export const linksApi = {
  backlinks,
  forward,
};
