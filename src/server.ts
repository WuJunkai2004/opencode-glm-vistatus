// Server-side entry — the `./server` export target.
//
// Serves the GLM Coding Plan quota over the host plugin-RPC channel under
// the cross-plugin convention (contract + recipe: docs/quota-rpc.md):
// register `<providerID>.quota` with a `status` method answering
// { label, groups: [{ title, bar, resetTime? } | { title, value }] } —
// `bar` is "xx/yy" or "nn%" (the reader derives fill/percentage and
// compacts), title/value are display-ready (the WRITER owns i18n) and
// resetTime is raw Time (Unix epoch ms; the READER renders countdown +
// clock against its own now).
//
// Why one handler under many ids: the rpcID must equal the GLM provider id
// in the user's opencode config, and that id is user-chosen
// (zai-coding-plan, zhipuai-coding-plan, z.ai, …) — so every alias in
// CANDIDATE_PROVIDER_IDS registers the same handler. Readers probe by
// convention and find whichever id they use.
//
// Load path: add the package to the SERVER plugin list (opencode.json[c])
// or a plugins/ directory. cli.json entries are TUI-only — the sidebar
// keeps its own direct fetch there; this entry is pure addition.
// Pull-based: readers poll, a 30s cache absorbs concurrent readers (one
// upstream fetch across all sessions). Any failure degrades to an empty
// group list; a host without the rpc domain (≥ v2.0.25 required) makes
// setup a safe no-op.

import { fetchAllQuota } from "./api/client";
import { parseQuotaData } from "./utils/quota-parser";
import { CANDIDATE_PROVIDER_IDS, getCredentials } from "./utils/auth";
import { detectLangZH, getTranslations } from "./ui/i18n";
import type { ExternalQuotaGroup } from "./utils/provider-quota";

interface QuotaSnapshot {
  label: string;
  groups: ExternalQuotaGroup[];
}

/** Structural type of the host's plugin-RPC domain (≥ v2.0.25). The
 * definition object is REQUIRED on host ≥ v2.3 — see the registration
 * note in setup(). */
interface RpcContext {
  rpc?: {
    register?: (
      definition: {
        readonly id: string;
        readonly methods: Record<
          string,
          { readonly input: unknown; readonly output: unknown }
        >;
        readonly events: Record<string, unknown>;
      },
      handlers: Record<
        string,
        (input: unknown, context: { signal: AbortSignal }) => Promise<unknown>
      >,
    ) => Promise<unknown>;
  };
}

const CACHE_MS = 30_000;

/** resetTime is wire-optional: null stays omitted, real timestamps go
 * raw (`Time`, epoch ms) — the reader renders countdown + clock against
 * its own "now", so the line stays fresh and the writer ships no i18n. */
function withReset(ts: number | null): { resetTime?: number } {
  return ts !== null ? { resetTime: ts } : {};
}

/** "xx/yy" when real numbers exist (reader derives % and compacts), else
 * "nn%". Mirrors the sidebar's own bar semantics. */
function quotaBar(
  percentage: number,
  used: number | null,
  total: number | null,
): string {
  if (used !== null && total !== null && total > 0) {
    return `${used}/${total}`;
  }
  return `${Math.round(percentage)}%`;
}

export default {
  id: "opencode-glm-vistatus",
  async setup(ctx: RpcContext): Promise<void> {
    const register = ctx.rpc?.register;
    if (!register) return; // host without the rpc domain → safe no-op

    // Standard i18n: same env-override + locale rule as the sidebar, so a
    // GLM snapshot reads exactly like the panel's own GLM view.
    const t = getTranslations(detectLangZH());

    let cache: { at: number; snap: QuotaSnapshot } | null = null;

    const status = async (): Promise<QuotaSnapshot> => {
      if (cache && Date.now() - cache.at < CACHE_MS) return cache.snap;
      let snap: QuotaSnapshot = { label: "GLM", groups: [] };
      try {
        const creds = getCredentials();
        if (creds) {
          const result = await fetchAllQuota(creds.token, creds.platform);
          const parsed = parseQuotaData(result.quotaData, result.modelData);
          const groups: ExternalQuotaGroup[] = [];
          // Plan row as a label group — byte-for-byte the sidebar's native
          // 套餐 row (same i18n, same right-aligned layout). The platform
          // row is NOT duplicated here: the panel renders its own platform
          // row natively (getPlatformName), and a second one would repeat.
          if (parsed.level) {
            groups.push({ title: t.plan, value: parsed.level });
          }
          if (parsed.fiveHour) {
            groups.push({
              title: t.token5h,
              bar: quotaBar(
                parsed.fiveHour.percentage,
                parsed.fiveHour.total !== null
                  ? Math.round(
                      (parsed.fiveHour.total * parsed.fiveHour.percentage) /
                        100,
                    )
                  : null,
                parsed.fiveHour.total,
              ),
              ...withReset(parsed.fiveHour.nextResetTime),
            });
          }
          if (parsed.weekly) {
            groups.push({
              title: t.weekly,
              bar: quotaBar(
                parsed.weekly.percentage,
                parsed.weekly.total !== null
                  ? Math.round(
                      (parsed.weekly.total * parsed.weekly.percentage) / 100,
                    )
                  : null,
                parsed.weekly.total,
              ),
              ...withReset(parsed.weekly.nextResetTime),
            });
          }
          if (parsed.mcp) {
            groups.push({
              title: t.mcp,
              bar: quotaBar(
                parsed.mcp.percentage,
                parsed.mcp.current,
                parsed.mcp.total,
              ),
            });
          }
          snap = { label: "GLM", groups };
        }
      } catch {
        // best-effort: degrade to "no data" — never throw past the RPC
      }
      cache = { at: Date.now(), snap };
      return snap;
    };

    for (const providerId of CANDIDATE_PROVIDER_IDS) {
      try {
        // Schema-form registration is REQUIRED on host ≥ v2.3: the short
        // form (id string + handlers) silently fails to register there
        // (verified live — zcode's short-form RPC answers "unavailable"
        // while atomcode's schema-form answers; 2026-11-21).
        await register(
          {
            id: `${providerId}.quota`,
            methods: {
              status: {
                input: {
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                },
                output: { type: "object" },
              },
            },
            events: {},
          },
          { status },
        );
      } catch {
        // one bad registration must not take the others down
      }
    }
  },
};
