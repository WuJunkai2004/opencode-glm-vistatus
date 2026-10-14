/**
 * Provider quota via the host plugin-RPC channel — the read side of the
 * cross-plugin protocol that lets OTHER provider plugins (atomcode,
 * codearts, …) feed this panel without any of the plugins importing each
 * other.
 *
 * Contract: a provider plugin registers `<providerID>.quota` with a
 * `status` method on the host's plugin-RPC domain (`ctx.rpc.register`,
 * server side, ≥ v2.0.25). This TUI plugin calls it through the host
 * client (`client.rpc.call` → `POST /api/rpc/<id>/status`) and expects
 *
 *   { label: string, groups: [{ title, bar, resetTime? }] }
 *
 * where `bar` is the QuotaBar string contract ("nn%" or "xx/yy") and
 * `title`/`resetTime` are display-ready — the WRITER owns i18n. The
 * rpcID is derived from the currently selected provider id by convention,
 * so no sibling plugin id is ever hardcoded here: adding a provider =
 * it starts serving the RPC; this panel needs zero changes.
 *
 * Everything that can fail (host without the client/rpc surface, unknown
 * rpc id, provider not logged in, transport error, malformed output)
 * resolves to null — callers render that as "no data for this provider"
 * and fall back to the GLM view. Unlike a cached file, the data is live:
 * there is no staleness window.
 */

export interface ExternalQuotaGroup {
  title: string;
  bar: string;
  resetTime?: string;
}

export interface ExternalQuotaRecord {
  /** Lowercased provider id this record was fetched for. */
  provider: string;
  label: string;
  /** Fetch time (epoch ms) — drives the header clock. */
  ts: number;
  groups: ExternalQuotaGroup[];
}

/** Reader cadence — quota data changes slowly; 30s keeps countdowns fresh. */
export const EXTERNAL_RECORD_POLL_MS = 30_000;

/** After a failed probe (no such RPC, provider offline, …) back off before
 * retrying — avoids one failing HTTP call every tick for providers that
 * simply have no quota RPC. Successes probe on the normal cadence. */
export const EXTERNAL_FAILURE_BACKOFF_MS = 120_000;

const MAX_LABEL = 48;
const MAX_GROUPS = 8;
const MAX_TITLE = 48;
const MAX_BAR = 64;
const MAX_RESET = 64;

/** rpcID convention: the writer registers `<providerID>.quota`. */
export function quotaRpcId(providerID: string): string {
  return `${providerID}.quota`;
}

function validGroup(value: unknown): ExternalQuotaGroup | null {
  if (typeof value !== "object" || value === null) return null;
  const g = value as Record<string, unknown>;
  if (
    typeof g.title !== "string" ||
    !g.title.trim() ||
    g.title.length > MAX_TITLE
  )
    return null;
  if (typeof g.bar !== "string" || !g.bar.trim() || g.bar.length > MAX_BAR)
    return null;
  const group: ExternalQuotaGroup = { title: g.title, bar: g.bar };
  if (
    typeof g.resetTime === "string" &&
    g.resetTime.trim() &&
    g.resetTime.length <= MAX_RESET
  ) {
    group.resetTime = g.resetTime;
  }
  return group;
}

/**
 * Minimal structural type of the host client surface this plugin needs
 * (`OpenCodeClient.rpc.call`, promise flavor). Hand-written like the rest
 * of `v2/types.ts` so the package typechecks standalone; the host injects
 * the real client.
 */
export interface QuotaRpcClient {
  rpc?: {
    call?: (input: {
      readonly rpcID: string;
      readonly method: string;
      readonly input?: unknown;
    }) => Promise<{ readonly output?: unknown }>;
  };
}

/**
 * Probe the selected provider's quota RPC. Returns null for anything
 * that is not a well-formed, non-empty snapshot.
 */
export async function fetchProviderQuota(
  client: QuotaRpcClient | undefined,
  providerID: string,
): Promise<ExternalQuotaRecord | null> {
  const call = client?.rpc?.call;
  const id = providerID.trim().toLowerCase();
  if (!call || !id) return null;

  let output: unknown;
  try {
    const res = await call({
      rpcID: quotaRpcId(id),
      method: "status",
      input: {},
    });
    output = res?.output;
  } catch {
    // unknown rpc id / handler failure / transport error → no data
    return null;
  }

  if (typeof output !== "object" || output === null) return null;
  const rec = output as Record<string, unknown>;
  if (
    typeof rec.label !== "string" ||
    !rec.label.trim() ||
    rec.label.length > MAX_LABEL
  ) {
    return null;
  }
  if (
    !Array.isArray(rec.groups) ||
    rec.groups.length === 0 ||
    rec.groups.length > MAX_GROUPS
  ) {
    return null;
  }
  const groups: ExternalQuotaGroup[] = [];
  for (const g of rec.groups) {
    const valid = validGroup(g);
    if (!valid) return null;
    groups.push(valid);
  }
  return { provider: id, label: rec.label, ts: Date.now(), groups };
}
