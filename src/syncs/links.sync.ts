/**
 * Link synchronizations.
 *
 * Endpoints:
 *   POST /links/backlinks { target } -> { sources }
 *   POST /links/forward   { source } -> { targets }
 */
import { Linking } from "@concepts";
import type { LinkingConcept } from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const backlinks = requestingEndpoint("/links/backlinks");
const forward = requestingEndpoint("/links/forward");

type BacklinksOutput = { sources: QueryRow<LinkingConcept, "_getBacklinks">[] };
type ForwardOutput = {
  targets: QueryRow<LinkingConcept, "_getForwardLinks">[];
};

// --- backlinks: public ---

export const LinkBacklinksResponse = backlinks.sync((
  { request, target, source, sources },
) => ({
  when: backlinks.actions(backlinks.request({ target }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Linking._getBacklinks, { target }, { source });
    return frames.aggregate(base, [source], sources);
  },
  then: backlinks.actions(
    backlinks.respond<BacklinksOutput>({ request, sources }),
  ),
}));

// --- forward: public ---

export const LinkForwardResponse = forward.sync((
  { request, source, target, targets },
) => ({
  when: forward.actions(forward.request({ source }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Linking._getForwardLinks,
      { source },
      { target },
    );
    return frames.aggregate(base, [target], targets);
  },
  then: forward.actions(forward.respond<ForwardOutput>({ request, targets })),
}));

export const linksApi = defineFeature({
  backlinks: backlinks.define({ LinkBacklinksResponse }),
  forward: forward.define({ LinkForwardResponse }),
});
