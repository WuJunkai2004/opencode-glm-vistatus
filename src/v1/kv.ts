/**
 * `KvAdapter` over the V1 host `api.kv`.
 *
 * V1's kv exposes only get/set (no cross-process lock), so `update` here is
 * a best-effort read–mutate–write against the local view: it serializes
 * within the process but not across sessions. The shared-record protocol
 * (`src/utils/shared-record.ts`) treats the claim as advisory in this case —
 * the pre-claim jitter plus re-read is what staggers sessions.
 */

import type { TuiKV } from "@opencode-ai/plugin/tui";
import type { KvAdapter } from "../ui/panel";

export function createKv(kv: TuiKV): KvAdapter {
  return {
    // Live getter: V1's kv readiness is dynamic at plugin init, and the
    // panel polls it — a snapshot here would freeze it at creation time.
    get ready() {
      return kv.ready;
    },
    get: <Value = unknown>(key: string, fallback?: Value): Value =>
      kv.get(key, fallback),
    set: (key: string, value: unknown) => kv.set(key, value),
    update<R>(
      key: string,
      fn: (current: unknown) => { next: unknown; result: R },
    ): R {
      const { next, result } = fn(kv.get(key));
      kv.set(key, next);
      return result;
    },
  };
}
