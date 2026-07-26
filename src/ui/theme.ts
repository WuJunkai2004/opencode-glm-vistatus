/**
 * Theme color adaptation — Morandi desaturation.
 * Source: opencode-visual-cache/src/index.tsx:150-266
 *
 * Key difference from visual-cache: quota color logic is inverted.
 * visual-cache colors by hit rate (higher = greener).
 * This plugin colors by usage rate (higher = redder, closer to limit = warning).
 */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";

/** Extract { r, g, b } (0–255) from a hex string or RGBA-like object. */
function rgb(raw: unknown): { r: number; g: number; b: number } | null {
  if (typeof raw === "string" && raw.startsWith("#")) {
    const h = raw.slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (
      typeof o.r === "number" &&
      typeof o.g === "number" &&
      typeof o.b === "number"
    ) {
      const scale = o.r > 1 || o.g > 1 || o.b > 1 ? 1 : 255;
      return {
        r: Math.round(o.r * scale),
        g: Math.round(o.g * scale),
        b: Math.round(o.b * scale),
      };
    }
  }
  return null;
}

/** HSL saturation of an RGB color (0–1). */
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (delta === 0) return 0;
  const L = (max + min) / 2;
  return L <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
}

/**
 * If the colour's saturation exceeds `maxSat`, pull it toward grey
 * until saturation drops to maxSat. Returns a hex string.
 */
function desaturateTo(raw: unknown, maxSat: number, fallback: string): string {
  const c = rgb(raw);
  if (!c) return fallback;
  const sat = saturation(c.r, c.g, c.b);
  if (sat <= maxSat) {
    return (
      "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")
    );
  }
  const luma = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const nr = Math.round(c.r + (luma - c.r) * mid);
    const ng = Math.round(c.g + (luma - c.g) * mid);
    const nb = Math.round(c.b + (luma - c.b) * mid);
    if (saturation(nr, ng, nb) > maxSat) lo = mid;
    else hi = mid;
  }
  const nr = Math.round(c.r + (luma - c.r) * hi);
  const ng = Math.round(c.g + (luma - c.g) * hi);
  const nb = Math.round(c.b + (luma - c.b) * hi);
  return (
    "#" +
    [nr, ng, nb]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Darken a hex colour by multiplying each channel by `factor` (0–1). */
export function dimColor(hex: string, factor = 0.5): string {
  const c = rgb(hex);
  if (!c) return hex;
  const r = Math.round(c.r * factor);
  const g = Math.round(c.g * factor);
  const b = Math.round(c.b * factor);
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Morandi fallbacks — used when a theme colour cannot be resolved. */
const FALLBACK = {
  primary: "#8B9DAF",
  text: "#C5C5BB",
  muted: "#7A7A72",
  success: "#9CAF8B",
  warning: "#C5B88D",
  error: "#B08A8A",
  border: "#6B6B63",
} as const;

/** Desaturation ceiling for the Morandi-style palette. */
const MAX_SAT = 0.28;

export interface ThemePalette {
  primary: string;
  text: string;
  muted: string;
  success: string;
  warning: string;
  error: string;
  border: string;
}

/** Build a desaturated Morandi palette from the current theme. */
export function buildPalette(theme: TuiThemeCurrent): ThemePalette {
  const t = theme as Record<string, unknown>;
  const sat = (k: string, fb: string) => desaturateTo(t[k], MAX_SAT, fb);
  return {
    primary: sat("primary", FALLBACK.primary),
    text: sat("text", FALLBACK.text),
    muted: sat("textMuted", FALLBACK.muted),
    success: sat("success", FALLBACK.success),
    warning: sat("warning", FALLBACK.warning),
    error: sat("error", FALLBACK.error),
    border: sat("border", FALLBACK.border),
  };
}

/**
 * Color based on usage percentage (INVERTED from visual-cache's hit rate).
 * Higher usage = more warning (closer to limit = danger).
 *   < 70% → success (green) — plenty remaining
 *   70-90% → warning (orange) — approaching limit
 *   >= 90% → error (red) — nearly exhausted
 */
export function quotaColor(percentage: number, pal: ThemePalette): string {
  if (percentage >= 90) return pal.error;
  if (percentage >= 70) return pal.warning;
  return pal.success;
}
