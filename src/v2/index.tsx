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
import { Show, createEffect, createMemo, onMount } from "solid-js";
import type { Context, PluginModule } from "./types";
import {
  KV,
  SOURCES_KEY,
  type KvAdapter,
  type PanelSignals,
  type SourceMap,
  createExternalRecordTrack,
} from "../ui/panel";
import { GlmQuotaPanel } from "../ui/panel";
import {
  createPanelSignals,
  normalizeProviderList,
  restorePanelConfig,
} from "../utils/panel-signals";
import {
  fetchProviderQuota,
  type ExternalQuotaRecord,
} from "../utils/provider-quota";
import { createKv } from "./kv";
import { mapTheme } from "./theme";
import { makeCommands } from "./commands";

/** Command layer host — mounted in the always-present `app` slot. */
function CommandRoot(props: {
  context: Context;
  kv: KvAdapter;
  signals: PanelSignals;
  projectDir: string;
}): JSX.Element {
  props.context.keymap.layer(() => ({
    mode: "global",
    commands: makeCommands({
      context: props.context,
      kv: props.kv,
      signals: props.signals,
      projectDir: props.projectDir,
    }),
  }));
  return null;
}

/**
 * Provider-visibility gate + quota-source pinning.
 *
 * Visibility: reads the prompt's selected provider (`ui.model.current()`,
 * reactive in a Solid computation) and hides the panel while the provider
 * filter is on and the provider doesn't match. Filter off (default) →
 * always visible. A pinned source (`signals.pinProvider`) overrides the
 * filter entirely — the user explicitly chose what to display. This
 * applies to any non-null pin, the legacy "glm" alias included.
 *
 * Probe target: normally the selected provider; a pinned external source
 * redirects the probe (that is the whole "watch atomcode while running
 * GLM models" feature). The legacy "glm" value (normalizePin keeps it
 * valid for old KV entries, nothing writes it anymore) does NOT redirect:
 * it falls through to the selected provider — auto-follow for the data
 * source, same as null.
 *
 * Discovery (passive + sweep): every well-formed RPC snapshot teaches the
 * gate that `<provider>` serves quota (learned map, KV-persisted, seeds
 * the panel's source cycle list). Additionally `client.provider.list()`
 * is swept once at mount — each listed provider is probed once — so
 * external sources are discovered without being selected first. If the
 * list call is unavailable or fails, selection-driven passive learning
 * still fills the map.
 */
function ProviderGate(props: {
  context: Context;
  kv: KvAdapter;
  signals: PanelSignals;
  children: (signals: PanelSignals) => JSX.Element;
}): JSX.Element {
  const currentProvider = () => props.context.ui.model?.current?.()?.providerID;
  // Effective pin — only honored while the master switch (manualSource,
  // default off) is on; off reproduces the auto-follow behavior exactly.
  // The pin signal is normalized once at restore (`normalizePin`) and only
  // ever written with normalized values, so it is trusted as-is here.
  const pin = createMemo(() =>
    props.signals.manualSource() ? props.signals.pinProvider() : null,
  );

  /** Merge a confirmed source into the learned map (atomically on V2).
   *  One entry per display label: a writer that answers several ids with
   *  the same snapshot (this plugin's own ./server export registers one
   *  RPC per GLM credential alias) collapses into a single cycle entry.
   *  A generic rule — no id list to maintain, every writer equal. */
  const learnSource = (provider: string, label: string) => {
    try {
      const cur = props.kv.get<SourceMap>(SOURCES_KEY);
      if (
        cur &&
        (cur[provider]?.label === label ||
          Object.values(cur).some((v) => v.label === label))
      ) {
        return;
      }
      void props.kv.update<void>(SOURCES_KEY, (c) => {
        const map = (typeof c === "object" && c !== null ? c : {}) as SourceMap;
        if (Object.values(map).some((v) => v.label === label)) {
          return { next: map, result: undefined };
        }
        return {
          next: { ...map, [provider]: { label, ts: Date.now() } },
          result: undefined,
        };
      });
    } catch {}
  };

  const probeTarget = createMemo<string | undefined>(() => {
    const p = pin();
    // "glm" (legacy alias) falls through like null — it never redirects
    // the probe; only real provider ids pin the data source.
    if (p && p !== "glm") return p;
    const id = currentProvider()?.trim().toLowerCase();
    return id || undefined;
  });
  const externalRecord = createExternalRecordTrack(
    probeTarget,
    props.context.client,
  );

  // Passive learning: ride on every snapshot the track already fetches.
  createEffect(() => {
    const r = externalRecord();
    if (r) learnSource(r.provider, r.label);
  });

  // 显示条件 = 按当前供应商显示: switching the prompt's provider re-syncs
  // the switcher to the new provider's entry — a manual pin is an
  // override that lasts until the next provider switch (auto-follow on
  // the cleared pin probes the selected provider, which IS the
  // corresponding entry). 显示条件 = 固定: no jump, the pin survives.
  let prevProvider: string | undefined;
  createEffect(() => {
    const id = currentProvider()?.trim().toLowerCase();
    const prev = prevProvider;
    prevProvider = id;
    if (!props.signals.manualSource() || !props.signals.providerFilter()) return;
    if (!id || prev === undefined || prev === id) return;
    try {
      void props.kv.set(`${KV}.pin`, null);
    } catch {}
    props.signals.setPinProvider(null);
  });

  // Mount-time discovery sweep: probe every provider the host lists once,
  // so sources are discoverable without being selected first.
  // ── Discovery sweep (mount, once) ────────────────────────────────────
  // Probes every host-listed provider id once; whatever answers
  // `<id>.quota` joins the cycle list. No id is special-cased — sibling
  // plugins and this plugin's own ./server export are equal. A provider
  // hot-loaded after mount is picked up by passive learning the moment
  // its model is selected (the gate probe then answers and teaches the
  // id); restarting the TUI re-runs the sweep.
  onMount(() => {
    const known = new Set(
      Object.keys(props.kv.get<SourceMap>(SOURCES_KEY) ?? {}),
    );
    const seen = new Set<string>();
    const candidates: string[] = [];
    const addCandidate = (raw: unknown) => {
      const id = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
      if (
        !id ||
        seen.has(id) ||
        known.has(id) ||
        id.length > 48 ||
        /\s/.test(id)
      ) {
        return;
      }
      seen.add(id);
      candidates.push(id);
    };

    const sweep = (ids: string[]) => {
      for (const id of ids) {
        void fetchProviderQuota(props.context.client, id).then((rec) => {
          if (rec) learnSource(rec.provider, rec.label);
        });
      }
    };

    // Host provider list — `client.provider.list()` → GET /api/provider.
    // Verified live: resolves to a BARE ARRAY of `{ id, name, models }`;
    // the `{ all }` shape from the SDK docs is tolerated, nothing else.
    // Anything answering `<id>.quota` joins the cycle list.
    const listProviders = (
      props.context.client as
        | {
            provider?: {
              list?: () => Promise<unknown>;
            };
          }
        | undefined
    )?.provider?.list;
    if (typeof listProviders === "function") {
      void listProviders()
        .then((res: unknown) => {
          const all: Array<{ id?: unknown }> = Array.isArray(res)
            ? (res as Array<{ id?: unknown }>)
            : Array.isArray((res as { all?: unknown } | null)?.all)
              ? (res as { all: Array<{ id?: unknown }> }).all
              : [];
          for (const p of all) {
            addCandidate(typeof p?.id === "string" ? p.id : undefined);
          }
          sweep(candidates);
          return undefined;
        })
        .catch(() => {});
    }
  });

  const gatedSignals: PanelSignals = {
    ...props.signals,
    externalRecord,
  };
  const visible = createMemo(() => {
    if (pin()) return true;
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
    const kv = createKv(context, KV);

    // ── Shared signals + persisted config restore (V2 storage is sync-ready) ──
    const signals = createPanelSignals();
    restorePanelConfig(kv, signals);
    signals.setMatchedProviders(
      normalizeProviderList(context.options?.matchedProviders),
    );

    const projectDir =
      context.location?.directory ||
      (typeof process !== "undefined" ? process.cwd() : "") ||
      ".";

    // ── Sidebar quota panel (shared component, V1-identical layout) ──
    context.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <ProviderGate context={context} kv={kv} signals={signals}>
          {(gated) => (
            <GlmQuotaPanel
              theme={mapTheme(context.theme)}
              kv={kv}
              signals={gated}
            />
          )}
        </ProviderGate>
      ),
    });

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
    });
  },
};

export default mod;
