/**
 * Terminal-width helpers and progress bar.
 * Source: opencode-visual-cache/src/index.tsx:34-72, 261-266
 */

/**
 * Get the number of terminal columns a character occupies.
 * CJK and wide characters take 2 columns; ASCII takes 1.
 */
export function charColumns(c: string): number {
  const code = c.codePointAt(0) ?? 0;
  if (code < 0x20) return 0; // control
  if (code < 0x7f) return 1; // ASCII
  if (code < 0xa0) return 0; // C1 controls
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK Radicals … Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compat
    (code >= 0xfe10 && code <= 0xfe6f) || // Vertical / Compat
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
    (code >= 0x1f300 && code <= 0x1f64f) || // Misc Symbols (emoji)
    (code >= 0x20000 && code <= 0x3fffd) // SIP / TIP
  )
    return 2;
  return 1;
}

/** Total visual width of a string in terminal columns. */
export function visualWidth(s: string): number {
  let w = 0;
  for (const c of s) w += charColumns(c);
  return w;
}

/** Pad string to `cols` visual columns on the right. */
export function visualPadEnd(s: string, cols: number): string {
  const pad = cols - visualWidth(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

/** Truncate `s` to fit within `maxCols` visual columns, appending "…" when cut. */
export function truncateVisual(s: string, maxCols: number): string {
  if (visualWidth(s) <= maxCols) return s;
  let result = "",
    w = 0;
  for (const c of s) {
    const cw = charColumns(c);
    if (w + cw > maxCols - 1) {
      result += "\u2026";
      break;
    }
    result += c;
    w += cw;
  }
  return result;
}

/**
 * Render a fixed-width progress bar using █ (filled) and ░ (empty).
 * @param percent - 0-100, clamped
 * @param width - number of characters
 */
export function progressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}
