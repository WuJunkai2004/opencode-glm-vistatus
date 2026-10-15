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
 *   - `prepend: "sidebar.content"` — the quota panel, wrapped in a
 *     provider-visibility gate (`ProviderGate`): always visible by default;
 *     when the `providerFilter` setting is on it renders only while the
 *     prompt's selected provider matches `matchedProviders` or serves a
 *     live quota RPC (src/utils/provider-quota.ts). The gate also feeds
 *     the panel the selected provider's quota snapshot, so the data
 *     source follows the selection (external provider → its groups).
 *     Prepend keeps the plugin block at the top of the sidebar; with
 *     opencode-visual-cache (also prepended) the config order preserves
 *     the V1 order (55/60).
 *   - `append: "app"` — a null-rendering component that mounts the keymap
 *     command layer. Commands must not depend on sidebar visibility, so they
 *     live in the always-mounted app slot.
 */

import type { JSX } from "@opentui/solid";
import { Show, createMemo } from "solid-js";
import type { Context, PluginModule } from "./types";
import {
  KV,
  type KvAdapter,
  type PanelSignals,
  createExternalRecordTrack,
} from "../ui/panel";
import { GlmQuotaPanel } from "../ui/panel";
import {
  createPanelSignals,
  normalizeProviderList,
  restorePanelConfig,
} from "../utils/panel-signals";
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

/**
 * Provider-visibility gate. Reads the prompt's selected provider
 * (`ui.model.current()`, reactive in a Solid computation) and hides the
 * panel while the provider filter is on and the provider doesn't match.
 * Filter off (default) → always visible; filter on with no readable
 * provider (no `ui.model` on pre-v2.0.25 hosts, or no model selected)
 * keeps the panel hidden — strict match, no fallback.
 *
 * Data-driven exception: a provider whose own plugin serves a live quota
 * RPC (src/utils/provider-quota.ts) is relevant by construction — it opens
 * the gate without its id being configured in `matchedProviders`, and no
 * cross-plugin id is ever hardcoded here. The gate owns the single RPC
 * probe track and passes it down to the panel through the signals object.
 */
function ProviderGate(props: {
  context: Context;
  signals: PanelSignals;
  children: (signals: PanelSignals) => JSX.Element;
}): JSX.Element {
  const currentProvider = () => props.context.ui.model?.current?.()?.providerID;
  const externalRecord = createExternalRecordTrack(
    () => currentProvider()?.trim().toLowerCase(),
    props.context.client,
  );
  const gatedSignals: PanelSignals = {
    ...props.signals,
    externalRecord,
  };
  const visible = createMemo(() => {
    if (!props.signals.providerFilter()) return true;
    const id = currentProvider()?.trim().toLowerCase();
    if (!id) return false;
    if (props.signals.matchedProviders().includes(id)) return true;
    return externalRecord()?.provider === id;
  });
  return <Show when={visible()}>{props.children(gatedSignals)}</Show>;
}

const mod: PluginModule = {
  id: "opencode-glm-vistatus",
  setup(context: Context) {
    const kv = createKv(context, KV)

    // ── Shared signals + persisted config restore (V2 storage is sync-ready) ──
    const signals = createPanelSignals()
    restorePanelConfig(kv, signals)
    signals.setMatchedProviders(normalizeProviderList(context.options?.matchedProviders))

    const projectDir =
      context.location?.directory ||
      (typeof process !== "undefined" ? process.cwd() : "") ||
      "."

    // ── Sidebar quota panel (shared component, V1-identical layout) ──
    context.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <ProviderGate context={context} signals={signals}>
          {(gated) => (
            <GlmQuotaPanel
              theme={mapTheme(context.theme)}
              kv={kv}
              signals={gated}
            />
          )}
        </ProviderGate>
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
