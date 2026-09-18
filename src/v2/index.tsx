/** @jsxImportSource @opentui/solid */

/**
 * OpenCode V2 TUI plugin entry.
 *
 * Loaded through the package's `./tui` export (`dist/tui.js`, built from
 * `src/tui.ts`): V2 reads the `setup` field of the default export. The
 * sidebar panel is the shared `GlmQuotaPanel`; signals + config restore
 * come from `src/utils/panel-signals.ts`, commands from `src/v2/commands.ts`.
 *
 * Slots:
 *   - `prepend: "sidebar.content"` — the quota panel. Prepend keeps the
 *     plugin block at the top of the sidebar; with opencode-visual-cache
 *     (also prepended) the config order preserves the V1 order (55/60).
 *   - `append: "app"` — a null-rendering component that mounts the keymap
 *     command layer. Commands must not depend on sidebar visibility, so they
 *     live in the always-mounted app slot.
 */

import type { JSX } from "@opentui/solid";
import type { Context, PluginModule } from "./types";
import { KV, type KvAdapter, type PanelSignals } from "../ui/panel";
import { GlmQuotaPanel } from "../ui/panel";
import { createPanelSignals, restorePanelConfig } from "../utils/panel-signals";
import { createKv } from "./kv";
import { mapTheme } from "./theme";
import { makeCommands } from "./commands";

/** Command layer host — mounted in the always-present `app` slot. */
function CommandRoot(props: { context: Context; kv: KvAdapter; signals: PanelSignals; projectDir: string }): JSX.Element {
  props.context.keymap.layer(() => ({
    mode: "global",
    commands: makeCommands({
      context: props.context,
      kv: props.kv,
      signals: props.signals,
      projectDir: props.projectDir,
    }),
  }))
  return null
}

const mod: PluginModule = {
  id: "opencode-glm-vistatus",
  setup(context: Context) {
    const kv = createKv(context, KV)

    // ── Shared signals + persisted config restore (V2 storage is sync-ready) ──
    const signals = createPanelSignals()
    restorePanelConfig(kv, signals)

    const projectDir =
      context.location?.directory ||
      (typeof process !== "undefined" ? process.cwd() : "") ||
      "."

    // ── Sidebar quota panel (shared component, V1-identical layout) ──
    context.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <GlmQuotaPanel
          theme={mapTheme(context.theme)}
          kv={kv}
          signals={signals}
        />
      ),
    })

    // ── Command layer (always mounted; survives sidebar hide/narrow) ──
    context.ui.slot({
      append: "app",
      render: () => (
        <CommandRoot
          context={context}
          kv={kv}
          signals={signals}
          projectDir={projectDir}
        />
      ),
    })
  },
}

export default mod
