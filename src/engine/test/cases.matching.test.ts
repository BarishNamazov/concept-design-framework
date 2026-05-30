/**
 * Focused engine tests covering the core matching/joining model:
 *  - `query` inner-join drop-on-empty (fan-out),
 *  - `aggregate` empty + non-empty,
 *  - `collectAs` grouping,
 *  - `error` vs `question` output mutual-exclusivity,
 *  - flow isolation across independent action invocations,
 *  - synced double-fire prevention.
 *
 * The Frames-level cases exercise {@link Frames} directly; the engine-level
 * cases wire small mock concepts together with inline, declarative syncs.
 */
import { describe, expect, test } from "bun:test";
import { actions, Frames, Logging, SyncConcept, type Vars } from "../mod.ts";
import { CounterConcept, GateConcept, RecorderConcept } from "./mocks.ts";

describe("engine: Frames query/aggregate/collectAs", () => {
  test("query drops frames whose query returns no rows (inner join)", () => {
    const id = Symbol("id");
    const item = Symbol("item");
    const frames = new Frames({ [id]: "a" }, { [id]: "b" });

    // "a" has two children, "b" has none -> "b" frame is dropped entirely.
    const children: Record<string, string[]> = { a: ["a1", "a2"], b: [] };
    const out = frames.query(
      ({ id }: { id: string }) => children[id].map((value) => ({ value })),
      { id },
      { value: item },
    );

    expect(out).toBeInstanceOf(Frames);
    expect(out.length).toBe(2);
    expect(out.map(($) => $[item]).sort()).toEqual(["a1", "a2"]);
    expect(out.every(($) => $[id] === "a")).toBe(true);
  });

  test("aggregate on empty frames yields one frame with an empty list", () => {
    const request = Symbol("request");
    const value = Symbol("value");
    const list = Symbol("list");

    const empty = new Frames();
    const out = empty.aggregate({ [request]: "req-1" }, [value], list);

    expect(out.length).toBe(1);
    expect(out[0][request]).toBe("req-1");
    expect(out[0][list]).toEqual([]);
  });

  test("aggregate on non-empty frames behaves like collectAs", () => {
    const request = Symbol("request");
    const value = Symbol("value");
    const list = Symbol("list");

    const frames = new Frames(
      { [request]: "req-1", [value]: 1 },
      { [request]: "req-1", [value]: 2 },
    );
    const out = frames.aggregate({ [request]: "req-1" }, [value], list);

    expect(out.length).toBe(1);
    expect(out[0][request]).toBe("req-1");
    expect(out[0][list]).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("collectAs groups by surviving keys", () => {
    const group = Symbol("group");
    const value = Symbol("value");
    const items = Symbol("items");

    const frames = new Frames(
      { [group]: "x", [value]: 1 },
      { [group]: "x", [value]: 2 },
      { [group]: "y", [value]: 3 },
    );
    const out = frames.collectAs([value], items);

    expect(out.length).toBe(2);
    const byGroup = new Map(
      out.map(($): [unknown, unknown] => [$[group], $[items]]),
    );
    expect(byGroup.get("x")).toEqual([{ value: 1 }, { value: 2 }]);
    expect(byGroup.get("y")).toEqual([{ value: 3 }]);
  });
});

/** Wire a Gate + Recorder pair to syncs that branch on output shape. */
function gateSetup() {
  const Sync = new SyncConcept();
  Sync.logging = Logging.OFF;
  const { Gate, Recorder } = Sync.instrument({
    Gate: new GateConcept(),
    Recorder: new RecorderConcept(),
  });

  // Mutually exclusive: only one of these can ever match a single check.
  const OnError = ({ error }: Vars) => ({
    when: actions([Gate.check, {}, { error }]),
    then: actions([Gate.record, { msg: error }]),
  });
  const OnQuestion = ({ question }: Vars) => ({
    when: actions([Gate.check, {}, { question }]),
    then: actions([Gate.record, { msg: question }]),
  });
  Sync.register({ OnError, OnQuestion });
  return { Gate, Recorder };
}

describe("engine: output pattern mutual-exclusivity", () => {
  test("a negative value matches only the `error` sync", async () => {
    const { Gate } = gateSetup();
    await Gate.check({ value: -3 });
    expect(Gate.seen).toEqual(["negative:-3"]);
  });

  test("a non-negative value matches only the `question` sync", async () => {
    const { Gate } = gateSetup();
    await Gate.check({ value: 7 });
    expect(Gate.seen).toEqual(["value:7"]);
  });
});

describe("engine: flow isolation", () => {
  test("independent invocations do not cross-match", async () => {
    const { Gate } = gateSetup();
    // Each check runs in its own flow; the two never combine.
    await Gate.check({ value: -1 });
    await Gate.check({ value: 2 });
    expect(Gate.seen.sort()).toEqual(["negative:-1", "value:2"]);
  });
});

describe("engine: synced double-fire prevention", () => {
  test("a multi-`when` sync consumes each record at most once", async () => {
    const Sync = new SyncConcept();
    Sync.logging = Logging.OFF;
    const { Recorder, Counter } = Sync.instrument({
      Recorder: new RecorderConcept(),
      Counter: new CounterConcept(),
    });

    // Cascade: a simple tag produces its ":a" successor (same flow).
    const Cascade = ({ tag, next }: Vars) => ({
      when: actions([Recorder.record, { tag }, {}]),
      where: (frames: Frames) =>
        frames
          .filter(($) => !String($[tag]).includes(":"))
          .map((frame) => ({ ...frame, [next]: `${String(frame[tag])}:a` })),
      then: actions([Recorder.record, { tag: next }]),
    });

    // Pair: matches the (base, base:a) pair exactly once and bumps a counter.
    const Pair = ({ tag1, tag2 }: Vars) => ({
      when: actions(
        [Recorder.record, { tag: tag1 }, {}],
        [Recorder.record, { tag: tag2 }, {}],
      ),
      where: (frames: Frames) =>
        frames
          .filter(($) => !String($[tag1]).includes(":"))
          .filter(($) => String($[tag2]) === `${String($[tag1])}:a`),
      then: actions([Counter.increment, {}]),
    });
    Sync.register({ Cascade, Pair });

    await Recorder.record({ tag: "x" });

    expect(Recorder.order).toEqual(["x", "x:a"]);
    // Without synced marks the pair could be re-consumed and over-count.
    expect(Counter.count).toBe(1);
  });
});
