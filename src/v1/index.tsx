/** @jsxImportSource @opentui/solid */

/**
 * OpenCode V1 TUI plugin entry.
 *
 * Loaded through the package's `./tui` export (`dist/tui.js`, built from
 * `src/tui.ts`): V1 hosts read the `tui` field of the default export.
 * Signals + config restore come from `src/utils/panel-signals.ts`; the
 * sidebar panel is the shared `GlmQuotaPanel` (`src/ui/panel.tsx`); slash
 * commands live in `src/v1/commands.tsx`.
 */

import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";

import { createPanelSignals, restorePanelConfig } from "../utils/panel-signals";
import { createSidebarSlot } from "./sidebar";
import { buildV1Commands } from "./commands";

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  const signals = createPanelSignals();

  // Restore persisted config. V1 kv may not be ready at plugin init —
  // poll briefly, then restore whatever is readable.
  const restore = () => restorePanelConfig(api.kv, signals);
  if (api.kv.ready) {
    restore();
  } else {
    let tries = 0;
    const poll = () => {
      if (!api.kv.ready) {
        if (++tries > 100) {
          restore();
          return;
        }
        setTimeout(poll, 10);
        return;
      }
      restore();
    };
    poll();
  }

  api.slots.register(createSidebarSlot(api, signals));

  // ── Slash commands (/glm-refresh, /glm-config, /glm-mcp-manage) ──
  api.command?.register(() => buildV1Commands(api, signals));
};

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-glm-vistatus",
  tui,
};

export default mod;
