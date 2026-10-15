/**
 * Shared panel state used by both host entrypoints:
 *   V1 (`src/v1`) passes `api.kv` wrapped by `src/v1/kv.ts`; V2 (`src/v2`)
 *   passes the storage-backed adapter from `src/v2/kv.ts` — both satisfy
 *   the neutral `KvAdapter`.
 */

import { createSignal } from "solid-js";
import {
  KV,
  DEFAULT_REFRESH_INTERVAL_MIN,
  MIN_REFRESH_INTERVAL_MIN,
  MAX_REFRESH_INTERVAL_MIN,
  detectLangZH,
  type KvAdapter,
  type PanelSignals,
} from "../ui/panel";
import { CANDIDATE_PROVIDER_IDS } from "./auth";

/** Create the panel signals with defaults (language auto-detected). */
export function createPanelSignals(): PanelSignals {
  const [langZH, setLangZH] = createSignal(detectLangZH());
  const [borderVisible, setBorderVisible] = createSignal(true);
  const [refreshIntervalMin, setRefreshIntervalMin] = createSignal(
    DEFAULT_REFRESH_INTERVAL_MIN,
  );
  const [forceRefresh, setForceRefresh] = createSignal(0);
  const [providerFilter, setProviderFilter] = createSignal(false);
  const [matchedProviders, setMatchedProviders] = createSignal<
    readonly string[]
  >(CANDIDATE_PROVIDER_IDS);

  return {
    langZH,
    setLangZH,
    borderVisible,
    setBorderVisible,
    refreshIntervalMin,
    setRefreshIntervalMin,
    forceRefresh,
    setForceRefresh,
    providerFilter,
    setProviderFilter,
    matchedProviders,
    setMatchedProviders,
  };
}

/**
 * Normalize a plugin-option provider list (`matchedProviders`) into the
 * lowercase comparison form: strings only, trimmed, lowercased, deduped.
 * Anything else (missing/wrong type/empty) falls back to the GLM
 * credential IDs. Providers outside this plugin (atomcode, codearts, …)
 * are added by user config — they are never hardcoded here.
 */
export function normalizeProviderList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return CANDIDATE_PROVIDER_IDS;
  const list = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
  return list.length > 0 ? [...new Set(list)] : CANDIDATE_PROVIDER_IDS;
}

/** A persisted refresh interval must be a finite number within the bounds. */
export function isValidInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_REFRESH_INTERVAL_MIN &&
    value <= MAX_REFRESH_INTERVAL_MIN
  );
}

/** Read persisted settings from `kv` and apply them to `signals`. */
export function restorePanelConfig(kv: KvAdapter, signals: PanelSignals): void {
  try {
    const savedLang = kv.get<string>(`${KV}.lang`);
    if (savedLang === "zh" || savedLang === "en")
      signals.setLangZH(savedLang === "zh");
    signals.setBorderVisible(kv.get<boolean>(`${KV}.border`, true) !== false);
    const savedInterval = kv.get<number>(`${KV}.interval`);
    if (isValidInterval(savedInterval)) {
      signals.setRefreshIntervalMin(Math.round(savedInterval));
    }
    signals.setProviderFilter(
      kv.get<boolean>(`${KV}.providerFilter`, false) === true,
    );
  } catch {}
}
