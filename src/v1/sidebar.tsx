/** @jsxImportSource @opentui/solid */

/**
 * V1 sidebar slot: renders the shared `GlmQuotaPanel` in `sidebar.content`.
 * `order: 60` keeps it after visual-cache (55), matching the V1 era order.
 */

import type { JSX } from "@opentui/solid";
import type {
  TuiPluginApi,
  TuiSlotContext,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui";
import { GlmQuotaPanel, type PanelSignals } from "../ui/panel";

export function createSidebarSlot(
  api: TuiPluginApi,
  signals: PanelSignals,
): TuiSlotPlugin {
  return {
    order: 60, // After visual-cache (55)
    slots: {
      sidebar_content(
        ctx: TuiSlotContext,
        _input: { session_id: string },
      ): JSX.Element {
        return (
          <GlmQuotaPanel
            theme={ctx.theme.current}
            kv={api.kv}
            signals={signals}
          />
        );
      },
    },
  };
}
