/**
 * Quota row blocks — the neutral display base shared by every provider
 * integration (GLM today; atomcode / codearts next).
 *
 * Two row kinds (the two `ExternalQuotaGroup` wire forms):
 *
 * - `QuotaBar` — a bar row, up to three lines:
 *
 *     line 1: title                xx/yy (right, only for "xx/yy" bars)
 *     line 2: [████░░░░]           nn%   (right, always a percentage)
 *     line 3: resetTime (optional)
 *
 * - `LabelRow` — a label row: right-aligned key/value metadata line
 *   (platform, plan, …), title rendered with the trailing `title:`
 *   colon that budgets one visual column.
 *
 * `bar` is a plain string in one of two forms:
 *
 *   - "nn%"    percentage only          → "31%", "40.5%"
 *   - "xx/yy"  used/total               → "12.5M/40M", "6,173/7,000"
 *
 * Placement follows the form: a percentage sits right of the bar; a
 * used/total sits right of the title and the bar line still shows the
 * percentage derived from it (`parseBarPercent` also derives the fill
 * and the color). An unparseable string falls back to neutral accent +
 * empty fill, right of the bar — a provider can never crash the panel
 * by passing an odd string. `resetTime` on the component is
 * display-ready; compose it from the wire's raw `Time` with
 * `resetLineOf` (same module) — both GLM and external paths share it.
 */

import type { JSX } from "@opentui/solid";
import { Show, createMemo } from "solid-js";
import { progressBar, visualWidth } from "./widgets";
import { quotaColor, type ThemePalette } from "./theme";
import {
  formatPercentage,
  formatResetCountdown,
  formatResetClock,
} from "../utils/format";
import type { Translations } from "./i18n";

/** "[" + "]" — visual columns around the bar. */
const BAR_BRACKETS = 2;
/** Space between "]" and the bar-line percentage. */
const BAR_GAP = 1;

const MIN_BAR_WIDTH = 3;

/** Number with optional thousands separators and decimals: 40 / 6,173.51 */
const NUM = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`;
const PCT_RE = new RegExp(`^\\s*(${NUM})\\s*%\\s*$`);
const RATIO_RE = new RegExp(
  `^\\s*(${NUM})\\s*([kKmMbB]?)\\s*/\\s*(${NUM})\\s*([kKmMbB]?)\\s*$`,
);
const SUFFIX: Record<string, number> = { "": 1, k: 1e3, m: 1e6, b: 1e9 };

function toNumber(digits: string, suffix: string): number {
  const mult = SUFFIX[suffix.toLowerCase()] ?? 1;
  return parseFloat(digits.replace(/,/g, "")) * mult;
}

const clampPercent = (n: number): number => Math.min(100, Math.max(0, n));

/** Which form a bar string takes, plus the percentage it encodes. */
export type ParsedBar =
  | { form: "pct"; percent: number }
  | { form: "ratio"; percent: number }
  | { form: "unknown"; percent: null };

export function parseBar(bar: string): ParsedBar {
  const pct = PCT_RE.exec(bar);
  if (pct)
    return { form: "pct", percent: parseFloat(pct[1].replace(/,/g, "")) };
  const ratio = RATIO_RE.exec(bar);
  if (ratio) {
    const total = toNumber(ratio[3], ratio[4]);
    if (total > 0) {
      return {
        form: "ratio",
        percent: (toNumber(ratio[1], ratio[2]) / total) * 100,
      };
    }
  }
  return { form: "unknown", percent: null };
}

/**
 * Percentage encoded by a bar string: "31%" → 31, "12.5M/40M" → 31.25,
 * "6,173/7,000" → 88.19. Returns null when neither form parses.
 */
export function parseBarPercent(bar: string): number | null {
  return parseBar(bar).percent;
}

/** One quota row: title + bar (+ optional reset line). */
export function QuotaBar(props: {
  title: string;
  /** "nn%" or "xx/yy" — see `parseBar`. */
  bar: string;
  /** Display-ready reset line (already formatted/i18n'd by the caller). */
  resetTime?: string | null;
  /** Content width in visual columns (panel width minus border gutter). */
  width: number;
  palette: ThemePalette;
}): JSX.Element {
  // Solid component bodies run ONCE — every derived value must live in a
  // memo so a `width` change (sidebar re-layout on session switch) re-flows
  // the bar without waiting for a data refresh / fold toggle to re-create
  // the node. Props are reactive getters; reading them inside a memo keeps
  // the chain tracked end-to-end (panel signal → prop → memo → JSX).
  const parsed = createMemo(() => parseBar(props.bar));
  const ratioForm = createMemo(() => parsed().form === "ratio");
  // Ratio string rides on the title line; the bar line always shows a
  // percentage (derived for "xx/yy", verbatim for "nn%" / unparseable).
  const barRight = createMemo(() =>
    ratioForm() ? formatPercentage(parsed().percent as number) : props.bar,
  );
  const titleRight = createMemo(() => (ratioForm() ? props.bar : ""));
  const fill = createMemo(() =>
    parsed().percent === null ? 0 : clampPercent(parsed().percent as number),
  );
  const color = createMemo(() =>
    parsed().percent === null
      ? props.palette.accent
      : quotaColor(fill(), props.palette),
  );
  const barWidth = createMemo(() =>
    Math.max(
      MIN_BAR_WIDTH,
      props.width - BAR_BRACKETS - BAR_GAP - visualWidth(barRight()),
    ),
  );
  const bar = createMemo(() => progressBar(fill(), barWidth()));
  const titleGap = createMemo(() =>
    titleRight()
      ? Math.max(
          1,
          props.width - visualWidth(props.title) - visualWidth(titleRight()),
        )
      : 0,
  );

  return (
    <>
      <text>
        <span style={{ fg: props.palette.info }}>{props.title}</span>
        <Show when={titleRight()}>
          <span style={{ fg: props.palette.accent }}>
            {" ".repeat(titleGap()) + titleRight()}
          </span>
        </Show>
      </text>
      <text>
        <span style={{ fg: color() }}>[{bar()}]</span>
        <span style={{ fg: props.palette.accent }}>
          {" ".repeat(BAR_GAP) + barRight()}
        </span>
      </text>
      <Show when={props.resetTime}>
        <text>
          <span style={{ fg: props.palette.muted }}>{props.resetTime}</span>
        </text>
      </Show>
    </>
  );
}

/** Compose the reset line from a raw timestamp — countdown vs now plus
 * clock/day (weekday shown once the horizon exceeds 12h), e.g.
 * "重置: 2h 30m (23:43)" / "重置: 4d 17h (Thu 16:03)". A past or absent
 * timestamp renders no line. Shared by the GLM path and external
 * records (whose wire carries raw `Time`) — the one place that turns
 * the protocol's canonical time into the display line. */
export function resetLineOf(
  resetTime: number | null,
  t: Translations,
): string | null {
  if (resetTime === null) return null;
  const countdown = formatResetCountdown(resetTime);
  if (countdown === "—") return null;
  const clock = formatResetClock(resetTime);
  return t.resetsIn + ": " + countdown + (clock ? " (" + clock + ")" : "");
}

/** Label row — accent title + bright value, right-aligned to `width`.
 * The reader renders the colon (`title:`), so the wire carries bare
 * names; the colon budgets one visual column in the alignment.
 * A COMPONENT with memos, not a plain function call: Solid bodies run
 * once, so the gap must re-derive from reactive props or the row
 * freezes at whatever panelWidth() was at mount (the QuotaBar pitfall,
 * label flavor — `panelWidth` starts at the default and only reaches
 * its real value after the first layout). */
export function LabelRow(props: {
  label: string;
  value: string;
  width: number;
  palette: ThemePalette;
}): JSX.Element {
  const gap = createMemo(() =>
    Math.max(
      1,
      props.width - visualWidth(props.label) - 1 - visualWidth(props.value),
    ),
  );
  return (
    <text>
      <span style={{ fg: props.palette.info }}>{props.label + ":"}</span>
      <span style={{ fg: props.palette.accent }}>
        {" ".repeat(gap()) + props.value}
      </span>
    </text>
  );
}
