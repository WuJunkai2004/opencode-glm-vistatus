/**
 * Formatting utilities — number, percentage, countdown, clock time.
 * Source: opencode-glm-quota/src/index.ts (formatResetCell, formatNumber, formatPlanLevel)
 * Source: opencode-visual-cache/src/index.tsx (fmt)
 */

/**
 * Format number compactly: 12.5M, 18.1K, or 1,234
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("en-US");
}

/**
 * Format number with full thousand separators: 12,500,000
 */
export function formatNumberFull(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format percentage: integer values shown without decimal ("40%"),
 * fractional values shown with one decimal ("40.5%").
 */
export function formatPercentage(n: number): string {
  const rounded = Math.floor(n * 10) / 10;
  if (Number.isInteger(rounded)) return rounded + "%";
  return rounded.toFixed(1) + "%";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format reset countdown from Unix millisecond timestamp.
 * Returns compact countdown: "3h 42m" or "4d 12h"
 */
export function formatResetCountdown(resetTime: number | null): string {
  if (resetTime === null) return "—";

  const diffMs = resetTime - Date.now();
  if (diffMs <= 0) return "—";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));

  if (totalMinutes >= 24 * 60) {
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Format reset clock time from Unix millisecond timestamp.
 * Short: "17:34" (same day) or "Sat 13:48" (future days)
 */
export function formatResetClock(resetTime: number | null): string {
  if (resetTime === null) return "";

  const diffMs = resetTime - Date.now();
  if (diffMs <= 0) return "";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const resetDate = new Date(resetTime);
  const hh = String(resetDate.getHours()).padStart(2, "0");
  const mm = String(resetDate.getMinutes()).padStart(2, "0");

  if (totalMinutes >= 24 * 60) {
    return `${DAY_NAMES[resetDate.getDay()]} ${hh}:${mm}`;
  }

  return `${hh}:${mm}`;
}

/**
 * Format a Date as HH:MM:SS for the "last updated" display.
 */
export function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Format a Date as HH:MM for compact display.
 */
export function formatClockShort(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
