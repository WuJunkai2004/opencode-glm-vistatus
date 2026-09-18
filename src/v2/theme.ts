/**
 * V2 theme → V1 `TuiThemeCurrent` shape mapping.
 *
 * The shared panel consumes themes through `buildPalette` (V1 field names:
 * primary/text/textMuted/success/…), so the V2 entry maps its token set once
 * at the render boundary.
 *
 * - V1 `primary`        → V2 `hue.interactive[300]` (official v1-migrate
 *   mapping: interactive = primary; step 300 stays readable on dark themes).
 * - V1 `textMuted`      → V2 `text.subdued`.
 * - feedback colours    → V2 `text.feedback.<kind>.default`.
 * - border              → V2 `text.subdued` (no dedicated border token).
 */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { Context } from "./types";

export function mapTheme(theme: Context["theme"]): TuiThemeCurrent {
  return {
    primary: theme.hue.interactive[300],
    text: theme.text.default,
    textMuted: theme.text.subdued,
    success: theme.text.feedback.success.default,
    warning: theme.text.feedback.warning.default,
    error: theme.text.feedback.error.default,
    border: theme.text.subdued,
  } as unknown as TuiThemeCurrent;
}
