/*
  Copyright (c) Eagon Meng, MIT CSAIL. All rights reserved.
  SPDX-License-Identifier: CC-BY-NC-SA-4.0
  Licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
  See https://creativecommons.org/licenses/by-nc-sa/4.0/
*/
export type Mapping = Record<string, unknown>;
export type Frame = Record<symbol, unknown>;

export type ActionFunction<TInput = Mapping, TOutput = Mapping> = (
  input: TInput,
) => TOutput;

type ExtractSymbolMappings<TOutputMapping, TFunctionOutput> = {
  [
    K in keyof TOutputMapping as TOutputMapping[K] extends symbol
      ? TOutputMapping[K]
      : never
  ]: K extends keyof TFunctionOutput ? TFunctionOutput[K] : never;
};

export interface Frames<TFrame extends Frame = Frame> {
  map<U extends Frame>(
    callbackfn: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U,
    thisArg?: unknown,
  ): Frames<U>;
  map<U>(
    callbackfn: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U,
    thisArg?: unknown,
  ): U[];
  filter<S extends TFrame>(
    predicate: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => value is S,
    thisArg?: unknown,
  ): Frames<S>;
  filter(
    predicate: (value: TFrame, index: number, array: TFrame[]) => unknown,
    thisArg?: unknown,
  ): this;

  flatMap<U extends Frame>(
    callback: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U | ReadonlyArray<U>,
    thisArg?: unknown,
  ): Frames<U>;
  flatMap<U>(
    callback: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U | ReadonlyArray<U>,
    thisArg?: unknown,
  ): U[];

  find<S extends TFrame>(
    predicate: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  find(
    predicate: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => unknown,
    thisArg?: unknown,
  ): TFrame | undefined;

  slice(start?: number, end?: number): this;

  concat(...items: ConcatArray<TFrame>[]): this;
  concat(...items: (TFrame | ConcatArray<TFrame>)[]): this;

  reverse(): this;
  sort(compareFn?: (a: TFrame, b: TFrame) => number): this;

  splice(start: number, deleteCount?: number): this;
  splice(start: number, deleteCount: number, ...items: TFrame[]): this;
}

export class Frames<TFrame extends Frame = Frame> extends Array<TFrame> {
  constructor(...frames: TFrame[]) {
    super(...frames);
    // Return a proxy that only handles method interception
    return new Proxy(this, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Only intercept function calls that might return arrays
        if (
          typeof value === "function" &&
          prop !== "query" &&
          prop !== "queryAsync"
        ) {
          return function (this: Frames<TFrame>, ...args: unknown[]) {
            const result = value.apply(this, args);

            // If method returns an array, wrap it
            if (
              Array.isArray(result) && !(result instanceof Frames)
            ) {
              return new Frames(...result);
            }

            return result;
          };
        }

        return value;
      },
    });
  }

  // Overloads: sync and async query function variants
  query<
    TFunction extends (...args: never[]) => unknown[],
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = ReturnType<TFunction> extends (infer U)[] ? U : never,
    TNewFrame extends Frame =
      & TFrame
      & ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Frames<TNewFrame>;
  query<
    TFunction extends (...args: never[]) => Promise<unknown[]>,
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = Awaited<ReturnType<TFunction>> extends (infer U)[] ? U
      : never,
    TNewFrame extends Frame =
      & TFrame
      & ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Promise<Frames<TNewFrame>>;
  query(
    f: (...args: never[]) => unknown[] | Promise<unknown[]>,
    input: Record<string, unknown>,
    output: Record<string, symbol>,
  ): Frames | Promise<Frames> {
    const result = new Frames();
    const promises: Promise<void>[] = [];

    const processOutputs = (
      frame: Frame,
      functionOutputArray: unknown[],
    ) => {
      for (const functionOutput of functionOutputArray) {
        const newFrame = { ...frame };
        for (const [outputKey, symbolKey] of Object.entries(output)) {
          if (
            typeof symbolKey === "symbol" &&
            functionOutput &&
            typeof functionOutput === "object" &&
            outputKey in functionOutput
          ) {
            (newFrame as Record<symbol, unknown>)[symbolKey] =
              (functionOutput as Record<string, unknown>)[
                outputKey
              ];
          }
        }
        result.push(newFrame as unknown as Frame);
      }
    };

    for (const frame of this) {
      const entries: [string, unknown][] = [];
      for (const [key, binding] of Object.entries(input)) {
        let value: unknown = binding;
        if (typeof binding === "symbol") {
          const bound = (frame as Record<symbol, unknown>)[binding];
          if (bound === undefined) {
            throw new Error(
              `Binding: ${String(binding)} not found in frame: ${frame}`,
            );
          }
          value = bound;
        }
        entries.push([key, value]);
      }
      const boundInput = Object.fromEntries(entries);

      const maybeArray = f(boundInput as never);
      if (
        typeof (maybeArray as Promise<unknown[]>).then === "function"
      ) {
        // async path
        const p = (maybeArray as Promise<unknown[]>).then((arr) => {
          processOutputs(frame, arr);
        });
        promises.push(p);
      } else {
        // sync path
        processOutputs(frame, maybeArray as unknown[]);
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then(() => result);
    }
    return result;
  }

  async queryAsync<
    TFunction extends (...args: never[]) => Promise<unknown[]>,
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = Awaited<ReturnType<TFunction>> extends (infer U)[] ? U
      : never,
    TNewFrame extends Frame =
      & TFrame
      & ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Promise<Frames<TNewFrame>> {
    const result = new Frames<TNewFrame>();

    for (const frame of this) {
      const entries: [string, unknown][] = [];
      // Lookup any unbound variables
      for (const [key, binding] of Object.entries(input)) {
        let value: unknown = binding;
        if (typeof binding === "symbol") {
          const bound = frame[binding];
          if (bound === undefined) {
            throw new Error(
              `Binding: ${String(binding)} not found in frame: ${frame}`,
            );
          }
          value = bound;
        }
        entries.push([key, value]);
      }
      const boundInput = Object.fromEntries(entries);

      // Execute the function - expect array of bindings (async)
      const functionOutputArray = await f(
        boundInput as Parameters<TFunction>[0],
      );

      for (const functionOutput of functionOutputArray) {
        // Create new frame with output bindings
        const newFrame = { ...frame };
        for (const [outputKey, symbolKey] of Object.entries(output)) {
          if (
            typeof symbolKey === "symbol" &&
            functionOutput &&
            typeof functionOutput === "object" &&
            outputKey in functionOutput
          ) {
            (newFrame as Record<symbol, unknown>)[symbolKey] =
              (functionOutput as Record<string, unknown>)[
                outputKey
              ];
          }
        }

        result.push(newFrame as unknown as TNewFrame);
      }
    }
    return result;
  }
  collectAs<
    TAsSymbol extends symbol,
  >(
    collect: symbol[],
    as: TAsSymbol,
  ): Frames {
    // Create a map to group frames by non-collected keys
    const groups = new Map<
      string,
      { groupFrame: Frame; collected: Record<string, unknown>[] }
    >();

    for (const frame of this) {
      // Separate collected and non-collected keys
      const groupKeys: Frame = {};
      const collectedRecord: Record<string, unknown> = {};

      // Use getOwnPropertySymbols to iterate over symbol keys
      const symbols = Object.getOwnPropertySymbols(frame);

      for (const symbolKey of symbols) {
        const value = (frame as Record<symbol, unknown>)[symbolKey];

        if (collect.includes(symbolKey)) {
          // Convert symbol to string for collected keys
          const symbolName = symbolKey.description || String(symbolKey);
          collectedRecord[symbolName] = value;
        } else {
          // Keep as symbol for group keys
          groupKeys[symbolKey] = value;
        }
      }

      // Create a stable key for grouping
      const groupKey = JSON.stringify(
        Object.getOwnPropertySymbols(groupKeys)
          .sort((a, b) => String(a).localeCompare(String(b)))
          .map((sym) => [String(sym), groupKeys[sym]]),
      );

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupFrame: groupKeys,
          collected: [],
        });
      }

      groups.get(groupKey)!.collected.push(collectedRecord);
    }

    // Build result frames
    const result = new Frames();
    for (const { groupFrame, collected } of groups.values()) {
      const newFrame = {
        ...groupFrame,
        [as]: collected,
      } as Frame;
      result.push(newFrame);
    }

    return result;
  }

  /**
   * Like {@link collectAs}, but guarantees exactly one output frame even when
   * `this` is empty — the common cause of a synchronization silently failing to
   * fire (see `design/memories/sync-learnings.md`, "Zero Matches").
   *
   * A list endpoint typically starts from a single request frame, fans out via
   * `.query` (which drops the frame when a query returns nothing), then collects
   * the results back into one list. If the query yields zero rows the request
   * frame is lost and no response is ever sent. `aggregate` restores it: pass the
   * originating `base` frame (captured before the queries) and, when there is
   * nothing to collect, it emits `base` with `as` bound to an empty array.
   *
   * @param base    bindings that must survive into the `then` clause (e.g. `request`).
   * @param collect symbols to gather into the list.
   * @param as      symbol the collected list is bound to.
   */
  aggregate(base: Frame, collect: symbol[], as: symbol): Frames {
    if (this.length === 0) {
      return new Frames({ ...base, [as]: [] } as Frame);
    }
    return this.collectAs(collect, as);
  }
}
