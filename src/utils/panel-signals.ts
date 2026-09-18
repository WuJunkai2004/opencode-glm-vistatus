/**
 * Shared panel state used by both host entrypoints:
 *   V1 (`src/v1`) passes `api.kv`; V2 (`src/v2`) passes the storage-backed
 *   adapter from `src/v2/kv.ts` — both satisfy the neutral `KvAdapter`.
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

/** Create the panel signals with defaults (language auto-detected). */
export function createPanelSignals(): PanelSignals {
  const [langZH, setLangZH] = createSignal(detectLangZH());
  const [borderVisible, setBorderVisible] = createSignal(true);
  const [refreshIntervalMin, setRefreshIntervalMin] = createSignal(
    DEFAULT_REFRESH_INTERVAL_MIN,
  );
  const [forceRefresh, setForceRefresh] = createSignal(0);

  return {
    langZH,
    setLangZH,
    borderVisible,
    setBorderVisible,
    refreshIntervalMin,
    setRefreshIntervalMin,
    forceRefresh,
    setForceRefresh,
  };
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
  } catch {}
}
