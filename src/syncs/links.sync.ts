/**
 * Link synchronizations.
 *
 * Endpoints:
 *   POST /links/backlinks { target } -> { sources }
 *   POST /links/forward   { source } -> { targets }
 */
import { actions, type Sync } from "@engine";
import { Linking, Requesting } from "@concepts";

// --- backlinks: public ---

export const LinkBacklinksResponse: Sync = (
  { request, target, source, sources },
) => ({
  when: actions([
    Requesting.request,
    { path: "/links/backlinks", target },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Linking._getBacklinks, { target }, { source });
    return frames.aggregate(base, [source], sources);
  },
  then: actions([Requesting.respond, { request, sources }]),
});

// --- forward: public ---

export const LinkForwardResponse: Sync = (
  { request, source, target, targets },
) => ({
  when: actions([
    Requesting.request,
    { path: "/links/forward", source },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Linking._getForwardLinks,
      { source },
      { target },
    );
    return frames.aggregate(base, [target], targets);
  },
  then: actions([Requesting.respond, { request, targets }]),
});
