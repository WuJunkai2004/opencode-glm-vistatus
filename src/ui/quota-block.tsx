/**
 * Quota bar block — the neutral display base shared by every provider
 * integration (GLM today; atomcode / codearts next).
 *
 * One group renders up to three lines:
 *
 *   line 1: title                xx/yy (right, only for "xx/yy" bars)
 *   line 2: [████░░░░]           nn%   (right, always a percentage)
 *   line 3: resetTime (optional)
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
 * by passing an odd string. `resetTime` is display-ready — the caller
 * owns i18n/formatting (e.g. "重置: 2h 48m (17:34)").
 */

import type { JSX } from "@opentui/solid";
import { Show, createMemo } from "solid-js";
import { progressBar, visualWidth } from "./widgets";
import { quotaColor, type ThemePalette } from "./theme";
import { formatPercentage } from "../utils/format";

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
