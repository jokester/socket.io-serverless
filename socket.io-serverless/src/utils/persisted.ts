import type * as CF from '@cloudflare/workers-types';

export function persisted<T extends object>(
  create: () => T,
  state: CF.DurableObjectState
): {
  get value(): T;
  mutate(fn: (v: T) => T): void;
} {
  let created: T | null = null;
  return {
    get value() {
      return (created ??= create());
    },
    mutate(fn: (v: T) => T) {
      created = fn(created ?? create());
      state.storage.put('state', created);
    },
  };
}