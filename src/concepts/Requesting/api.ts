import { Requesting } from "@concepts";
import type { Frames, Mapping, Sync, Vars } from "@engine";
import { type ActionList, type ActionPattern, actions } from "@engine";

declare const requestInput: unique symbol;
declare const responseOutput: unique symbol;
declare const endpointContract: unique symbol;

export type ApiError = { error: string };
export type EmptyInput = Record<PropertyKey, never>;

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

type Fn<C, K extends keyof C> = C[K] extends (...args: never[]) => unknown
  ? C[K]
  : never;

export type ActionOk<C, K extends keyof C> = Exclude<
  Awaited<ReturnType<Fn<C, K>>>,
  ApiError
>;

export type QueryRow<C, K extends keyof C> =
  Awaited<ReturnType<Fn<C, K>>> extends readonly (infer R)[] ? R : never;

type RequestInputMeta<TInput extends object> = {
  readonly [requestInput]: TInput;
};

type ResponseOutputMeta<TOutput> = {
  readonly [responseOutput]: TOutput;
};

type EndpointSync<TInput extends object = never, TOutput = never> = Sync &
  RequestInputMeta<TInput> &
  ResponseOutputMeta<TOutput>;

interface EndpointDefinition<
  TPath extends string,
  TInput extends object,
  TOutput,
> {
  readonly path: TPath;
  readonly syncs: Record<string, Sync>;
  readonly [endpointContract]: {
    readonly [P in TPath]: {
      readonly input: TInput;
      readonly output: TOutput;
    };
  };
}

interface EndpointDsl {
  Request<const TInput extends Mapping>(
    input: TInput,
  ): ActionList & RequestInputMeta<RequestInputFromPattern<TInput>>;
  Request(): ActionList & RequestInputMeta<EmptyInput>;

  Respond<TOutput extends object>(
    body: Mapping,
  ): ActionList & ResponseOutputMeta<TOutput>;
  Respond<const TBody extends Mapping>(
    body: TBody,
  ): ActionList & ResponseOutputMeta<ResponseBodyFromPattern<TBody>>;

  Fail(error: unknown): ActionList & ResponseOutputMeta<never>;

  Actions<const TPatterns extends readonly ActionList[]>(
    ...patterns: TPatterns
  ): ActionPattern[] &
    RequestInputMeta<InputUnionFromPatterns<TPatterns>> &
    ResponseOutputMeta<OutputUnionFromPatterns<TPatterns>>;

  Sync<const TDeclaration extends EndpointSyncDeclaration>(
    fn: (vars: Vars) => TDeclaration,
  ): EndpointSync<
    InputFromDeclaration<TDeclaration>,
    OutputFromDeclaration<TDeclaration>
  >;
}

type EndpointSyncDeclaration = {
  when: ActionPattern[];
  where?: (frames: Frames) => Frames | Promise<Frames>;
  then: ActionPattern[];
};

type RequestInputFromPattern<TInput extends Mapping> = Prettify<{
  [K in keyof TInput & string]: string;
}>;

type ResponseBodyFromPattern<TBody extends Mapping> = Prettify<{
  [K in Exclude<keyof TBody, "request"> & string]: TBody[K];
}>;

type InputOf<T> = T extends RequestInputMeta<infer TInput> ? TInput : never;
type OutputOf<T> =
  T extends ResponseOutputMeta<infer TOutput> ? TOutput : never;

type InputUnionFromPatterns<TPatterns extends readonly unknown[]> = InputOf<
  TPatterns[number]
>;
type OutputUnionFromPatterns<TPatterns extends readonly unknown[]> = OutputOf<
  TPatterns[number]
>;

type InputFromDeclaration<TDeclaration extends EndpointSyncDeclaration> =
  InputOf<TDeclaration["when"]>;
type OutputFromDeclaration<TDeclaration extends EndpointSyncDeclaration> =
  OutputOf<TDeclaration["then"]>;

type EndpointInputFromSyncs<TSyncs extends Record<string, unknown>> =
  MergeInputUnion<InputOf<TSyncs[keyof TSyncs]>>;
type EndpointOutputFromSyncs<TSyncs extends Record<string, unknown>> = OutputOf<
  TSyncs[keyof TSyncs]
>;

type KeysOfUnion<T> = T extends T ? keyof T : never;

type MergeInputUnion<TInput> = [KeysOfUnion<TInput>] extends [never]
  ? EmptyInput
  : Prettify<{
      [K in KeysOfUnion<TInput> & string]: string;
    }>;

type UnionToIntersection<T> = (
  T extends unknown
    ? (value: T) => void
    : never
) extends (value: infer I) => void
  ? I
  : never;

type EndpointContracts<T> =
  T extends EndpointDefinition<string, object, unknown>
    ? NonNullable<T[typeof endpointContract]>
    : T extends (...args: never[]) => unknown
      ? never
      : T extends readonly unknown[]
        ? EndpointContracts<T[number]>
        : T extends object
          ? EndpointContracts<T[keyof T]>
          : never;

export type ContractOf<T> = Prettify<UnionToIntersection<EndpointContracts<T>>>;

export function defineEndpoint<
  const TPath extends string,
  const TSyncs extends Record<string, EndpointSync<object, unknown>>,
>(
  path: TPath,
  build: (helpers: EndpointDsl) => TSyncs,
): EndpointDefinition<
  TPath,
  EndpointInputFromSyncs<TSyncs>,
  EndpointOutputFromSyncs<TSyncs>
> {
  let activeRequest: symbol | undefined;

  const requestPattern = (input: Mapping, output: Mapping) =>
    [Requesting.request, { path, ...input }, output] as unknown as ActionList &
      RequestInputMeta<object>;

  const respond = (body: Mapping) =>
    [Requesting.respond, body] as unknown as ActionList &
      ResponseOutputMeta<object>;

  const getActiveRequest = (): symbol => {
    if (activeRequest === undefined) {
      throw new Error(
        "Endpoint helper used outside Sync declaration construction.",
      );
    }
    return activeRequest;
  };

  const Request = ((input: Mapping = {}) =>
    requestPattern(input, {
      request: getActiveRequest(),
    })) as unknown as EndpointDsl["Request"];

  const Respond = ((body: Mapping) =>
    respond({
      request: getActiveRequest(),
      ...body,
    })) as unknown as EndpointDsl["Respond"];

  const Fail = ((error: unknown) => {
    const body = isPlainMapping(error) ? error : { error };
    return respond({ request: getActiveRequest(), ...body }) as ActionList &
      ResponseOutputMeta<never>;
  }) as EndpointDsl["Fail"];

  const Actions = ((...patterns: ActionList[]) =>
    actions(...patterns)) as unknown as EndpointDsl["Actions"];

  const Sync = ((fn: (vars: Vars) => EndpointSyncDeclaration) => {
    const sync = ((vars: Vars) => {
      const previousRequest = activeRequest;
      const request = vars.__request;
      activeRequest = request;

      try {
        const declaration = fn(vars);
        // Every endpoint sync is request-scoped; explicit Request(...) calls
        // only add typed body fields to that same request.
        const [requestAnchor] = actions(requestPattern({}, { request }));
        return {
          ...declaration,
          when: [requestAnchor, ...declaration.when],
        };
      } finally {
        activeRequest = previousRequest;
      }
    }) as Sync;

    return sync as EndpointSync<object, unknown>;
  }) as EndpointDsl["Sync"];

  const helpers: EndpointDsl = {
    Request,
    Respond,
    Fail,
    Actions,
    Sync,
  };

  const syncs = build(helpers);
  return { path, syncs } as unknown as EndpointDefinition<
    TPath,
    EndpointInputFromSyncs<TSyncs>,
    EndpointOutputFromSyncs<TSyncs>
  >;
}

export function syncMap(api: Record<string, unknown>): Record<string, Sync> {
  const out: Record<string, Sync> = {};

  function visit(value: unknown, prefix: string): void {
    if (isEndpointDefinition(value)) {
      for (const [name, sync] of Object.entries(value.syncs)) {
        out[prefix === "" ? name : `${prefix}.${name}`] = sync;
      }
      return;
    }

    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix === "" ? key : `${prefix}.${key}`);
    }
  }

  visit(api, "");
  return out;
}

function isEndpointDefinition(
  value: unknown,
): value is EndpointDefinition<string, object, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "path" in value &&
    "syncs" in value
  );
}

function isPlainMapping(value: unknown): value is Mapping {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
