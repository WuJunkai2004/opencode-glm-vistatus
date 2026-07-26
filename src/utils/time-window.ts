/**
 * Time window calculation for model-usage / tool-usage queries.
 * Source: opencode-glm-quota/src/utils/time-window.ts + date-formatter.ts
 * Completely reused — 24-hour rolling window from yesterday at current hour
 * to today at current hour end.
 */

/**
 * Format date as yyyy-MM-dd HH:mm:ss
 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface TimeWindow {
  startTime: string;
  endTime: string;
}

/**
 * Get 24-hour rolling time window.
 * From yesterday at current hour to today at current hour end.
 *
 * Example: If now is 2026-01-18 14:30:00
 * - startTime: 2026-01-17 14:00:00
 * - endTime: 2026-01-18 14:59:59.999
 */
export function getTimeWindow(now: Date = new Date()): TimeWindow {
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    now.getHours(),
    0,
    0,
    0,
  );

  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    59,
    59,
    999,
  );

  return {
    startTime: formatDateTime(startDate),
    endTime: formatDateTime(endDate),
  };
}

/**
 * Create query parameters string for time window.
 * @returns URL-encoded query string: "startTime=...&endTime=..."
 */
export function getTimeWindowQueryParams(now: Date = new Date()): string {
  const { startTime, endTime } = getTimeWindow(now);
  return `startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
}
