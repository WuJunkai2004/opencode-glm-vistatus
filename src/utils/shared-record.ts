/**
 * Shared quota record — host-neutral fetch-coordination protocol.
 *
 * Concurrent TUI sessions share one record under the `glm_quota_panel.shared`
 * KV key so a refresh window triggers a single GLM Monitor API fetch instead
 * of one fetch per session:
 *
 * - V2: `context.storage.store` is durable and live-synced across running
 *   TUI instances (the host watches the store files and reconciles remote
 *   writes reactively). Claims are atomic through the host's locked
 *   read-modify-write (`KvAdapter.update`), so exactly one session fetches.
 * - V1: `api.kv` is a plain get/set store without a cross-process lock; its
 *   adapter's `update` is a best-effort naive RMW, so the claim stays
 *   advisory — the jitter plus re-read is what staggers sessions.
 *
 * The record carries only API responses plus an FNV-1a hash of the
 * credential token (account-mismatch detection) — never the token itself.
 */

import type { QuotaResult } from "../api/client";

export const SHARED_RECORD_VERSION = 1;
/** KV key (below the `glm_quota_panel` namespace) holding the record. */
export const SHARED_RECORD_KEY = "shared";

/** How long a fetch claim is trusted before another session may take over. */
export const CLAIM_TTL_MS = 15_000;
/** Waiter poll cadence while another session holds the claim. */
export const WAIT_POLL_MS = 300;
/** Total time a waiter waits for the claim holder to publish. */
export const WAIT_TIMEOUT_MS = CLAIM_TTL_MS + 2_000;
/** Random pre-claim delay range — staggers sessions whose ticks align. */
export const JITTER_MIN_MS = 150;
export const JITTER_MAX_MS = 900;

export interface FetchClaim {
  id: string;
  ts: number;
}

export interface SharedQuotaRecord {
  v: typeof SHARED_RECORD_VERSION;
  /** FNV-1a hash of the credential token the data was fetched with. */
  tokenHash: string;
  /** Epoch ms of fetch completion (shown as "last update" in every session). */
  ts: number;
  /** False when the quota endpoint returned nothing (failure record). */
  ok: boolean;
  error?: string;
  result?: QuotaResult;
  /** Present while a session is fetching; cleared on publish. */
  claim?: FetchClaim;
}

/** FNV-1a 32-bit → 8 hex chars. Not cryptographic; identity check only. */
export function hashToken(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Shape-validate an untrusted value (KV contents may be stale or foreign). */
export function normalizeRecord(value: unknown): SharedQuotaRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const rec = value as SharedQuotaRecord;
  if (rec.v !== SHARED_RECORD_VERSION) return null;
  if (typeof rec.tokenHash !== "string") return null;
  if (typeof rec.ts !== "number" || !Number.isFinite(rec.ts)) return null;
  if (typeof rec.ok !== "boolean") return null;
  return rec;
}

/** True when `rec` was completed less than `windowMs` ago (0 → never fresh). */
export function isRecordFresh(
  rec: SharedQuotaRecord,
  windowMs: number,
): boolean {
  return (
    Number.isFinite(rec.ts) && windowMs > 0 && Date.now() - rec.ts < windowMs
  );
}

/** True when `claim` exists and has not expired (crash-safety window). */
export function isClaimActive(claim: FetchClaim | undefined): boolean {
  return (
    claim !== undefined &&
    Number.isFinite(claim.ts) &&
    Date.now() - claim.ts < CLAIM_TTL_MS
  );
}

export function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const jitter = () =>
  JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);

export interface CoordinateInput {
  /** Hash of the current credential token (account-mismatch filter). */
  tokenHash: string;
  /** Freshness window in ms; 0 forces revalidation (/glm-refresh). */
  windowMs: number;
  /** Read the current shared record (already normalized). */
  read: () => SharedQuotaRecord | null;
  /**
   * Claim the fetch when no unexpired foreign claim exists. Atomic on V2
   * (locked read-modify-write); advisory on V1 (naive RMW against the local
   * view), where the pre-claim jitter does the cross-process staggering.
   */
  claim: (id: string) => Promise<boolean> | boolean;
  /** Persist a record; must update the panel's de-dup guards first. */
  publish: (rec: SharedQuotaRecord) => void | Promise<void>;
  /** Perform the API fetch (never throws; failures are null fields). */
  fetch: () => Promise<QuotaResult>;
  /** Localized generic error for records whose quota endpoint failed. */
  fetchError: string;
}

export type CoordinateOutcome =
  | { action: "fresh"; record: SharedQuotaRecord }
  | { action: "fetched"; record: SharedQuotaRecord }
  | { action: "adopted"; record: SharedQuotaRecord }
  | { action: "stale" };

/**
 * Decide who fetches. One of:
 *   fresh   — a shared record inside the window; no network request
 *   fetched — this session claimed the fetch and published the new record
 *   adopted — another session fetched; its record is returned
 *   stale   — gave up waiting; keep the current display, retry next tick
 */
export async function coordinateFetch(
  input: CoordinateInput,
): Promise<CoordinateOutcome> {
  const sleep = defaultSleep;
  const matches = (rec: SharedQuotaRecord | null) =>
    rec && rec.tokenHash === input.tokenHash ? rec : null;

  // Adopt the result of a foreign claim holder, giving up when the claim
  // expires without a publish (crashed holder) or on timeout.
  const waitForHolder = async (): Promise<CoordinateOutcome> => {
    const baseline = input.read()?.ts ?? 0;
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(WAIT_POLL_MS);
      const cur = matches(input.read());
      if (!cur) continue;
      if (cur.ts > baseline && !cur.claim) {
        return { action: "adopted", record: cur };
      }
      if (!isClaimActive(cur.claim)) return { action: "stale" };
    }
    return { action: "stale" };
  };

  // 1) Fresh shared record → no network request at all.
  let mine = matches(input.read());
  if (mine && isRecordFresh(mine, input.windowMs)) {
    return { action: "fresh", record: mine };
  }

  // 2) Another session is fetching → wait for its publish.
  if (mine && isClaimActive(mine.claim)) {
    return waitForHolder();
  }

  // 3) Jitter, then re-check: sessions ticking together spread out here,
  //    and a fetch completed during the jitter is picked up for free.
  await sleep(jitter());
  mine = matches(input.read());
  if (mine && isRecordFresh(mine, input.windowMs)) {
    return { action: "fresh", record: mine };
  }
  if (mine && isClaimActive(mine.claim)) {
    return waitForHolder();
  }

  // 4) Claim the fetch. On V2's locked host store exactly one session wins;
  //    on V1 the claim is advisory (naive RMW) and the jitter above is the
  //    cross-process staggering.
  if (!(await input.claim(randomId()))) {
    return waitForHolder();
  }

  // 5) Fetch and publish (failure records too, so every session sees the
  //    error without re-fetching and the next window retries once).
  try {
    const result = await input.fetch();
    const ok = result.quotaData !== null;
    const record: SharedQuotaRecord = {
      v: SHARED_RECORD_VERSION,
      tokenHash: input.tokenHash,
      ts: Date.now(),
      ok,
      error: ok ? undefined : input.fetchError,
      result,
    };
    await input.publish(record);
    return { action: "fetched", record };
  } catch (e) {
    const record: SharedQuotaRecord = {
      v: SHARED_RECORD_VERSION,
      tokenHash: input.tokenHash,
      ts: Date.now(),
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    await input.publish(record);
    return { action: "fetched", record };
  }
}
