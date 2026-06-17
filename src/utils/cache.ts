type AnyFn = (...args: unknown[]) => unknown;

export interface CachedFn<T extends AnyFn> {
  (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T>;
  invalidate: () => void;
}

function serialize(arg: unknown): string {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (arg instanceof Date) return arg.getTime().toString();
  if (typeof arg === "object") {
    const keys = Object.keys(arg).sort();
    return `{${keys.map((k) => `${k}:${serialize((arg as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return String(arg);
}

function stableKey(args: unknown[]): string {
  return args.map(serialize).join("|");
}

export function cached<T extends AnyFn>(fn: T): CachedFn<T> {
  let cache = new Map<string, unknown>();

  const wrapper = function (
    this: ThisParameterType<T>,
    ...args: Parameters<T>
  ): ReturnType<T> {
    const key = stableKey(args as unknown[]);
    if (cache.has(key)) {
      return cache.get(key) as ReturnType<T>;
    }

    const result = fn.apply(this, args) as unknown;
    if (result instanceof Promise) {
      cache.set(key, result);
      result.then(
        (r: unknown) => cache.set(key, r),
        () => cache.delete(key),
      );
      return result as ReturnType<T>;
    }

    cache.set(key, result);
    return result as ReturnType<T>;
  };

  wrapper.invalidate = () => {
    cache = new Map();
  };

  return wrapper;
}
