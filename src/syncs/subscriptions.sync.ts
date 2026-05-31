/**
 * Subscription synchronizations.
 *
 * Endpoints:
 *   POST /subscriptions/subscribe     { session, target } -> { subscription }
 *   POST /subscriptions/unsubscribe   { session, target } -> { subscription }
 *   POST /subscriptions/mine          { session }         -> { subscriptions }
 *   POST /subscriptions/isSubscribed  { session, target } -> { subscribed }
 *   POST /subscriptions/subscribers   { target }          -> { subscribers }
 */
import { Sessioning, Subscribing } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type SubscribeOutput = ActionOk<typeof Subscribing, "subscribe">;
type UnsubscribeOutput = ActionOk<typeof Subscribing, "unsubscribe">;
type SubscriptionsMineOutput = {
  subscriptions: QueryRow<typeof Subscribing, "_getSubscriptions">[];
};
type IsSubscribedOutput = QueryRow<typeof Subscribing, "_isSubscribed">;
type SubscribersOutput = {
  subscribers: QueryRow<typeof Subscribing, "_getSubscribers">[];
};

// --- subscribe ---

const subscribe = defineEndpoint(
  "/subscriptions/subscribe",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SubscribeRequest: Sync(({ session, target, user }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Subscribing.subscribe, { user, target }]),
    })),

    SubscribeResponse: Sync(({ subscription }) => ({
      when: Actions([Subscribing.subscribe, {}, { subscription }]),
      then: Actions(Respond<SubscribeOutput>({ subscription })),
    })),

    SubscribeError: Sync(({ error }) => ({
      when: Actions([Subscribing.subscribe, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    SubscribeInvalidSession: Sync(({ session, active }) => ({
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

// --- unsubscribe ---

const unsubscribe = defineEndpoint(
  "/subscriptions/unsubscribe",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    UnsubscribeRequest: Sync(({ session, target, user }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Subscribing.unsubscribe, { user, target }]),
    })),

    UnsubscribeResponse: Sync(({ subscription }) => ({
      when: Actions([Subscribing.unsubscribe, {}, { subscription }]),
      then: Actions(Respond<UnsubscribeOutput>({ subscription })),
    })),

    UnsubscribeError: Sync(({ error }) => ({
      when: Actions([Subscribing.unsubscribe, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    UnsubscribeInvalidSession: Sync(({ session, active }) => ({
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

// --- mine: session-gated list ---

const mine = defineEndpoint(
  "/subscriptions/mine",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SubscriptionsMineResponse: Sync(
      ({ session, user, target, createdAt, subscriptions }) => ({
        when: Actions(Request({ session })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Subscribing._getSubscriptions,
            { user },
            { target, createdAt },
          );
          return frames.aggregate(base, [target, createdAt], subscriptions);
        },
        then: Actions(Respond<SubscriptionsMineOutput>({ subscriptions })),
      }),
    ),

    SubscriptionsMineInvalidSession: Sync(({ session, active }) => ({
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

// --- isSubscribed: session-gated single row ---

const isSubscribed = defineEndpoint(
  "/subscriptions/isSubscribed",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    IsSubscribedResponse: Sync(({ session, target, user, subscribed }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        return await frames.query(
          Subscribing._isSubscribed,
          { user, target },
          { subscribed },
        );
      },
      then: Actions(Respond<IsSubscribedOutput>({ subscribed })),
    })),

    IsSubscribedInvalidSession: Sync(({ session, active }) => ({
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

// --- subscribers: public ---

const subscribers = defineEndpoint(
  "/subscriptions/subscribers",
  ({ Sync, Actions, Request, Respond }) => ({
    SubscribersResponse: Sync(({ target, user, subscribers }) => ({
      when: Actions(Request({ target })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Subscribing._getSubscribers,
          { target },
          { user },
        );
        return frames.aggregate(base, [user], subscribers);
      },
      then: Actions(Respond<SubscribersOutput>({ subscribers })),
    })),
  }),
);

export const subscriptionsApi = {
  subscribe,
  unsubscribe,
  mine,
  isSubscribed,
  subscribers,
};
