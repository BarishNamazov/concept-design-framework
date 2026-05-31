import { actions, type ActionList, type ActionPattern } from "@engine";
import type { Frames } from "@engine";
import type { Mapping, Sync, Vars } from "@engine";
import { Requesting } from "@concepts";

declare const requestInput: unique symbol;
declare const responseOutput: unique symbol;
declare const endpointContract: unique symbol;

export type ApiError = { error: string };
export type EmptyInput = Record<PropertyKey, never>;

export type ContractShape = Record<string, { input: unknown; output: unknown }>;

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

type Fn<C, K extends keyof C> = C[K] extends (...args: never[]) => unknown
  ? C[K]
  : never;

export type ActionOk<C, K extends keyof C> = Exclude<
  Awaited<ReturnType<Fn<C, K>>>,
  ApiError
>;

export type QueryRow<C, K extends keyof C> = Awaited<ReturnType<Fn<C, K>>> extends
  readonly (infer R)[] ? R : never;

type RequestInputMeta<TInput extends object> = {
  readonly [requestInput]: TInput;
};

type ResponseOutputMeta<TOutput> = {
  readonly [responseOutput]: TOutput;
};

export type EndpointSync<TInput extends object = never, TOutput = never> =
  & Sync
  & RequestInputMeta<TInput>
  & ResponseOutputMeta<TOutput>;

export interface EndpointDefinition<
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

export interface EndpointBuilder<TPath extends string> {
  request<const TInput extends Mapping>(
    input: TInput,
    output: Mapping,
  ): ActionList & RequestInputMeta<RequestInputFromPattern<TInput>>;

  respond<TOutput extends object>(
    body: Mapping,
  ): ActionList & ResponseOutputMeta<TOutput>;
  respond<const TBody extends Mapping>(
    body: TBody,
  ): ActionList & ResponseOutputMeta<ResponseBodyFromPattern<TBody>>;

  error(body: Mapping): ActionList & ResponseOutputMeta<never>;

  actions<const TPatterns extends readonly ActionList[]>(
    ...patterns: TPatterns
  ): ActionPattern[] & RequestInputMeta<InputUnionFromPatterns<TPatterns>> &
    ResponseOutputMeta<OutputUnionFromPatterns<TPatterns>>;

  sync<const TDeclaration extends EndpointSyncDeclaration>(
    fn: (vars: Vars) => TDeclaration,
  ): EndpointSync<
    InputFromDeclaration<TDeclaration>,
    OutputFromDeclaration<TDeclaration>
  >;

  define<const TSyncs extends Record<string, EndpointSync<object, unknown>>>(
    syncs: TSyncs,
  ): EndpointDefinition<
    TPath,
    EndpointInputFromSyncs<TSyncs>,
    EndpointOutputFromSyncs<TSyncs>
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
type OutputOf<T> = T extends ResponseOutputMeta<infer TOutput> ? TOutput
  : never;

type InputUnionFromPatterns<TPatterns extends readonly unknown[]> =
  InputOf<TPatterns[number]>;
type OutputUnionFromPatterns<TPatterns extends readonly unknown[]> =
  OutputOf<TPatterns[number]>;

type InputFromDeclaration<TDeclaration extends EndpointSyncDeclaration> =
  InputOf<TDeclaration["when"]>;
type OutputFromDeclaration<TDeclaration extends EndpointSyncDeclaration> =
  OutputOf<TDeclaration["then"]>;

type EndpointInputFromSyncs<TSyncs extends Record<string, unknown>> =
  MergeInputUnion<InputOf<TSyncs[keyof TSyncs]>>;
type EndpointOutputFromSyncs<TSyncs extends Record<string, unknown>> =
  OutputOf<TSyncs[keyof TSyncs]>;

type KeysOfUnion<T> = T extends T ? keyof T : never;

type MergeInputUnion<TInput> = [KeysOfUnion<TInput>] extends [never] ? EmptyInput
  : Prettify<{
    [K in KeysOfUnion<TInput> & string]: string;
  }>;

type UnionToIntersection<T> =
  (T extends unknown ? (value: T) => void : never) extends
    (value: infer I) => void ? I
    : never;

type EndpointContracts<T> = T extends EndpointDefinition<string, object, unknown>
  ? NonNullable<T[typeof endpointContract]>
  : T extends (...args: never[]) => unknown ? never
  : T extends readonly unknown[] ? EndpointContracts<T[number]>
  : T extends object ? EndpointContracts<T[keyof T]>
  : never;

export type ContractOf<T> = Prettify<
  UnionToIntersection<EndpointContracts<T>>
>;

export type ApiPath<TApi extends ContractShape> = keyof TApi & string;
export type Input<TApi extends ContractShape, TPath extends ApiPath<TApi>> =
  TApi[TPath]["input"];
export type Output<TApi extends ContractShape, TPath extends ApiPath<TApi>> =
  TApi[TPath]["output"];
export type Result<TApi extends ContractShape, TPath extends ApiPath<TApi>> =
  | Output<TApi, TPath>
  | ApiError;

export function requestingEndpoint<const TPath extends string>(
  path: TPath,
): EndpointBuilder<TPath> {
  const builder = {
    request(input: Mapping, output: Mapping) {
      return [
        Requesting.request,
        { path, ...input },
        output,
      ] as unknown as ActionList & RequestInputMeta<object>;
    },

    respond(body: Mapping) {
      return [Requesting.respond, body] as unknown as ActionList &
        ResponseOutputMeta<object>;
    },

    error(body: Mapping) {
      return [Requesting.respond, body] as unknown as ActionList &
        ResponseOutputMeta<never>;
    },

    actions(...patterns: ActionList[]) {
      return actions(...patterns);
    },

    sync(fn: Sync) {
      return fn;
    },

    define(syncs: Record<string, Sync>) {
      return { path, syncs } as EndpointDefinition<TPath, object, unknown>;
    },
  };

  return builder as EndpointBuilder<TPath>;
}

export function defineFeature<const TFeature extends Record<string, unknown>>(
  feature: TFeature,
): TFeature {
  return feature;
}

export function defineApi<const TApi extends Record<string, unknown>>(
  api: TApi,
): TApi {
  return api;
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

function isEndpointDefinition(value: unknown): value is EndpointDefinition<
  string,
  object,
  unknown
> {
  return value !== null && typeof value === "object" &&
    "path" in value && "syncs" in value;
}
