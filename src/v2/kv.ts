/**
 * `KvAdapter` over the V2 `context.storage.store` API.
 *
 * V2 persists values as per-key Solid stores (`{ value }` wrapper); the
 * adapter lazily creates each store on first access so reads restore the
 * persisted value while writes mutate it. Stores are file-backed under the
 * host's state directory and live-synced across running TUI instances, and
 * `update` runs inside the host's file-locked read-modify-write, making
 * compare-and-set style claims atomic between sessions.
 */

import type { Context } from "./types";
import type { KvAdapter } from "../ui/panel";

export function createKv(context: Context, namespace: string): KvAdapter {
  type Entry = readonly [
    Record<string, any>,
    (fn: (d: Record<string, any>) => void) => Promise<void>,
  ];
  const stores = new Map<string, Entry>();

  const entry = (key: string, initial: unknown): Entry => {
    let e = stores.get(key);
    if (!e) {
      e = context.storage.store(`${namespace}.${key}`, {
        initial: { value: initial },
      }) as unknown as Entry;
      stores.set(key, e);
    }
    return e;
  };

  return {
    ready: true,
    get<Value = unknown>(key: string, fallback?: Value): Value {
      const [store] = entry(key, fallback);
      const v = store.value;
      return (v === undefined ? fallback : v) as Value;
    },
    set(key: string, value: unknown): Promise<void> {
      const [, mutate] = entry(key, value);
      return mutate((d) => {
        d.value = value;
      });
    },
    async update<R>(
      key: string,
      fn: (current: unknown) => { next: unknown; result: R },
    ): Promise<R> {
      const [, mutate] = entry(key, undefined);
      let result!: R;
      await mutate((d) => {
        const out = fn(d.value);
        d.value = out.next;
        result = out.result;
      });
      return result;
    },
  };
}
