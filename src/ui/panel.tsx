/** @jsxImportSource @opentui/solid */

/**
 * Shared GLM quota sidebar panel, consumed by both host entrypoints:
 *   V1 (`src/index.tsx`)  — registers via `api.slots.register`, passes `api.kv`
 *   V2 (`src/v2/index.tsx`) — registers via `context.ui.slot`, passes a
 *     `storage.store`-backed adapter (`src/v2/kv.ts`)
 *
 * The hosts differ only in how they supply theme tokens and persistent
 * storage, so the rendering, quota fetching and auto-refresh timer live here.
 */

import type { JSX } from "@opentui/solid";
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import {
  createMemo,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { PLUGIN_VERSION } from "../_version";

import { getCredentials } from "../utils/auth";
import { fetchAllQuota } from "../api/client";
import { parseQuotaData, type ParsedQuota } from "../utils/quota-parser";
import { getPlatformName } from "../api/platforms";
import {
  formatNumber,
  formatPercentage,
  formatResetCountdown,
  formatResetClock,
  formatClockShort,
} from "../utils/format";
import { visualWidth, truncateVisual, progressBar } from "./widgets";
import { buildPalette, dimColor, quotaColor, type ThemePalette } from "./theme";
import { getTranslations, type Translations } from "./i18n";

// ---------------------------------------------------------------------------
// Constants shared by the host entrypoints
// ---------------------------------------------------------------------------

export const KV = "glm_quota_panel";
export const DEFAULT_REFRESH_INTERVAL_MIN = 5; // minutes
export const MIN_REFRESH_INTERVAL_MIN = 1;
export const MAX_REFRESH_INTERVAL_MIN = 1440; // 24h

/** Initial language: `GLM_VISTATUS_LANG=zh|en` env override, else locale. */
export function detectLangZH(): boolean {
  const debug =
    typeof process !== "undefined" ? process.env?.GLM_VISTATUS_LANG : undefined;
  if (debug) return debug === "zh";
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Host-neutral contracts
// ---------------------------------------------------------------------------

/** Synchronous key/value view over the host's persistent store. */
export interface KvAdapter {
  get<Value = unknown>(key: string, fallback?: Value): Value;
  set(key: string, value: unknown): void | Promise<void>;
  /** True once reads are meaningful. V2's Solid store is always ready. */
  readonly ready: boolean;
}

/** Reactive settings shared by the panel and the command flows. */
export interface PanelSignals {
  langZH: () => boolean;
  setLangZH: (v: boolean) => void;
  borderVisible: () => boolean;
  setBorderVisible: (v: boolean) => void;
  refreshIntervalMin: () => number;
  setRefreshIntervalMin: (v: number) => void;
  forceRefresh: () => number;
  setForceRefresh: (v: number) => void;
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

const MIN_PANEL_WIDTH = 20;
const DEFAULT_PANEL_WIDTH = 30;

// Layout measurement constants (visual columns)
const BAR_BRACKETS = 2; // "[" + "]"
const BAR_GAP = 1; // space after "]"
const HEADER_PREFIX = 2; // "▼ " or "▶ "

export function GlmQuotaPanel(props: {
  theme: TuiThemeCurrent;
  kv: KvAdapter;
  signals: PanelSignals;
}): JSX.Element {
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_PANEL_WIDTH);
  const [quotaData, setQuotaData] = createSignal<ParsedQuota | null>(null);
  const [platformName, setPlatformName] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [lastUpdate, setLastUpdate] = createSignal<Date | null>(null);
  const [open, setOpen] = createSignal(true);
  let boxEl: any;

  const { langZH, borderVisible } = props.signals;
  const t = createMemo<Translations>(() => getTranslations(langZH()));
  const pal = createMemo<ThemePalette>(() => buildPalette(props.theme));

  // ── Refresh logic ──
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const creds = getCredentials();
      if (!creds) {
        setError(t().noCred);
        setLoading(false);
        return;
      }

      setPlatformName(getPlatformName(creds.platform));
      const result = await fetchAllQuota(creds.token, creds.platform);
      const parsed = parseQuotaData(result.quotaData, result.modelData);
      setQuotaData(parsed);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    setPanelWidth(DEFAULT_PANEL_WIDTH);

    // Restore fold state from kv
    try {
      if (props.kv.ready) {
        setOpen(Boolean(props.kv.get(`${KV}.open`, true)));
      } else {
        // Poll kv.ready with a timeout
        let tries = 0;
        const poll = () => {
          if (!props.kv.ready) {
            if (++tries > 100) {
              setOpen(Boolean(props.kv.get(`${KV}.open`, true)));
              return;
            }
            setTimeout(poll, 10);
            return;
          }
          setOpen(Boolean(props.kv.get(`${KV}.open`, true)));
        };
        poll();
      }
    } catch {}

    // First fetch
    refresh();
  });

  onCleanup(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  // ── Auto-refresh timer; rescheduled when the interval changes ──
  createEffect(() => {
    const minutes = props.signals.refreshIntervalMin();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, minutes * 60 * 1000);
  });

  // ── React to manual force-refresh signal ──
  createEffect(() => {
    const tick = props.signals.forceRefresh();
    if (tick > 0) refresh();
  });

  // ── Persist fold state ──
  const persistFold = (key: string, val: boolean) => {
    try {
      props.kv.set(`${KV}.${key}`, val);
    } catch {}
  };

  // ── Layout helpers ──
  const gutter = createMemo(() => (borderVisible() ? 6 : 0));
  const sep = createMemo(() =>
    "\u2500".repeat(Math.max(1, panelWidth() - gutter())),
  );

  // ── Labeled value line: accent label + bright value, right-aligned ──
  const labeledValue = (label: string, value: string): JSX.Element => {
    const gauge = panelWidth() - gutter();
    const gap = Math.max(1, gauge - visualWidth(label) - visualWidth(value));
    return (
      <text>
        <span style={{ fg: pal().info }}>{label}</span>
        <span style={{ fg: pal().accent }}>{" ".repeat(gap) + value}</span>
      </text>
    );
  };

  // ── Folded header percentage (5h usage) ──
  const foldedPct = createMemo(() => {
    const d = quotaData();
    if (!d?.fiveHour) return "";
    return formatPercentage(d.fiveHour.percentage);
  });

  // Resync panel width after border toggle
  createEffect(() => {
    borderVisible();
    if (boxEl && typeof boxEl.width === "number" && boxEl.width > 0) {
      const w = Math.max(MIN_PANEL_WIDTH, boxEl.width);
      setPanelWidth((prev) => (prev === w ? prev : w));
    }
  });

  // ── Render a quota block (multi-line layout) ──
  function renderQuotaBlock(
    label: string,
    percentage: number,
    used: number | null,
    total: number | null,
    resetTime: number | null,
  ): JSX.Element {
    const gauge = panelWidth() - gutter();
    const color = quotaColor(percentage, pal());
    const pct = formatPercentage(percentage);
    const pctW = visualWidth(pct);

    // Line 1: label (left) + used/total (right) — only when API provides total
    const hasUsedTotal = used !== null && total !== null;
    const usedTotal = hasUsedTotal
      ? formatNumber(used) + "/" + formatNumber(total)
      : "";

    // Line 2: full-width bar (left) + percentage (right)
    const barWidth = Math.max(3, gauge - BAR_BRACKETS - BAR_GAP - pctW);
    const bar = progressBar(percentage, barWidth);

    // Line 3: reset info (left)
    const countdown = formatResetCountdown(resetTime);
    const clock = formatResetClock(resetTime);

    const labelW = visualWidth(label);
    const valW = visualWidth(usedTotal);
    const line1Gap = hasUsedTotal ? Math.max(1, gauge - labelW - valW) : 0;

    return (
      <>
        <text>
          <span style={{ fg: pal().info }}>{label}</span>
          <Show when={hasUsedTotal}>
            <span style={{ fg: pal().accent }}>
              {" ".repeat(line1Gap) + usedTotal}
            </span>
          </Show>
        </text>
        <text>
          <span style={{ fg: color }}>[{bar}]</span>
          <span style={{ fg: pal().accent }}>{" ".repeat(BAR_GAP) + pct}</span>
        </text>
        <Show when={resetTime !== null}>
          <text>
            <span style={{ fg: pal().muted }}>
              {t().resetsIn + ": " + countdown}
            </span>
            <Show when={clock}>
              <span style={{ fg: dimColor(pal().muted, 0.75) }}>
                {" (" + clock + ")"}
              </span>
            </Show>
          </text>
        </Show>
      </>
    );
  }

  return (
    <box
      border={borderVisible()}
      {...(borderVisible() ? { borderColor: pal().border } : {})}
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={borderVisible() ? 2 : 0}
      paddingRight={borderVisible() ? 2 : 0}
      flexDirection="column"
      gap={0}
      ref={boxEl}
      onSizeChange={() => {
        const w = boxEl
          ? Math.max(MIN_PANEL_WIDTH, boxEl.width ?? 0)
          : DEFAULT_PANEL_WIDTH;
        setPanelWidth((prev) => (prev === w ? prev : w));
      }}
    >
      {/* Collapsible header */}
      <text
        onMouseUp={() =>
          setOpen((o) => {
            const n = !o;
            persistFold("open", n);
            return n;
          })
        }
      >
        <span style={{ fg: pal().muted }}>
          {open() ? "\u25bc " : "\u25b6 "}
        </span>
        <span style={{ fg: pal().primary }}>
          <b>{t().title}</b>
          <Show when={open()}>
            <span style={{ fg: dimColor(pal().muted, 0.6) }}>
              {" "}
              v{PLUGIN_VERSION}
            </span>
          </Show>
        </span>
        {/* Expanded: show last update time right-aligned */}
        <Show when={open() && lastUpdate()}>
          <span style={{ fg: dimColor(pal().muted, 0.7) }}>
            {" ".repeat(
              Math.max(
                1,
                panelWidth() -
                  gutter() -
                  HEADER_PREFIX -
                  visualWidth(t().title) -
                  visualWidth(" v" + PLUGIN_VERSION) -
                  visualWidth(formatClockShort(lastUpdate()!)),
              ),
            ) + formatClockShort(lastUpdate()!)}
          </span>
        </Show>
        {/* Folded: show 5h usage percentage */}
        <Show when={!open() && foldedPct()}>
          <span>
            {" ".repeat(
              Math.max(
                1,
                panelWidth() -
                  gutter() -
                  HEADER_PREFIX -
                  visualWidth(t().title) -
                  visualWidth(foldedPct() + " " + t().collapsed),
              ),
            )}
          </span>
          <span
            style={{
              fg: quotaColor(quotaData()?.fiveHour?.percentage ?? 0, pal()),
            }}
          >
            {foldedPct()} {t().collapsed}
          </span>
        </Show>
      </text>

      <Show when={open()}>
        {/* Separator */}
        <text fg={pal().muted}>{sep()}</text>

        {/* Platform info */}
        <Show when={platformName()}>
          {labeledValue(t().platform + ":", platformName())}
        </Show>

        {/* Plan level */}
        <Show when={quotaData()?.level}>
          {labeledValue(t().plan + ":", quotaData()!.level!)}
        </Show>

        {/* Loading state */}
        <Show when={loading() && !quotaData() && !error()}>
          <text>
            <span style={{ fg: pal().muted }}>{"> "}</span>
            <span style={{ fg: pal().muted }}>{t().refreshing}</span>
          </text>
        </Show>

        {/* Error state */}
        <Show when={error()}>
          <text>
            <span style={{ fg: pal().error }}>{"\u26a0 " + t().error}</span>
          </text>
          <Show when={error() === t().noCred}>
            <text fg={pal().muted}>{"  " + t().noCredHint}</text>
          </Show>
          <Show when={error() !== t().noCred}>
            <text fg={pal().muted}>
              {"  " + truncateVisual(error()!, panelWidth() - gutter() - 2)}
            </text>
          </Show>
        </Show>

        {/* No data (not loading, not error, no quota) */}
        <Show when={!loading() && !error() && !quotaData()}>
          <text>
            <span style={{ fg: pal().muted }}>{"> "}</span>
            <span style={{ fg: pal().muted }}>{t().noData}</span>
          </text>
        </Show>

        {/* Quota data */}
        <Show when={quotaData()}>
          {/* 5h Token */}
          <Show when={quotaData()!.fiveHour}>
            {(() => {
              const q = quotaData()!.fiveHour!;
              const used =
                q.total !== null
                  ? Math.round((q.total * q.percentage) / 100)
                  : null;
              return renderQuotaBlock(
                t().token5h,
                q.percentage,
                used,
                q.total,
                q.nextResetTime,
              );
            })()}
          </Show>

          {/* Weekly */}
          <Show when={quotaData()!.weekly}>
            {(() => {
              const q = quotaData()!.weekly!;
              const used =
                q.total !== null
                  ? Math.round((q.total * q.percentage) / 100)
                  : null;
              return renderQuotaBlock(
                t().weekly,
                q.percentage,
                used,
                q.total,
                q.nextResetTime,
              );
            })()}
          </Show>

          {/* MCP (no reset line) */}
          <Show when={quotaData()!.mcp}>
            {(() => {
              const mcp = quotaData()!.mcp!;
              return renderQuotaBlock(
                t().mcp,
                mcp.percentage,
                mcp.current,
                mcp.total,
                null,
              );
            })()}
          </Show>
        </Show>
      </Show>
    </box>
  );
}
