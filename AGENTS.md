# AGENTS.md

OpenCode TUI plugin — real-time GLM Coding Plan quota in the sidebar.

## Build & Development

```bash
npm install          # install dev deps only (runtime deps are host-provided)
npm run build        # tsc --noEmit (typecheck) && esbuild bundle → dist/tui.js (the only artifact)
npm run typecheck    # tsc --noEmit
npm run build:tui    # esbuild bundle only (skips tsc)
npm run inspect      # live API debug: fetches real quota data & prints each step (needs creds)
```

No test suite exists. Verify changes with `npm run typecheck && npm run build`.

### Versioning: `VERSION.txt` is the single source of truth

`VERSION.txt` (e.g. `0.1.0`) drives everything — never hand-edit `package.json`'s `version` directly. `npm run sync-version` copies `VERSION.txt` → `package.json` + `src/_version.ts` from it. `prepublishOnly` runs both automatically.

- `release.yml` (manual `workflow_dispatch`): bumps per rule (`minor+1, patch=0`; `minor>=10` rolls over to `major+1`), commits, tags `vX.Y.Z`, creates a GitHub Release. That VERSION.txt commit then triggers `publish.yml`.
- `publish.yml`: fires on any `VERSION.txt` change on `main` → syncs, builds, `npm publish --provenance --access public`, commits the synced `package.json` back to `main`.

### `src/_version.ts` is generated & gitignored

`scripts/sync-version.mjs` auto-creates it from `package.json` if missing; without it the bundle build fails. Never hand-edit or commit it.

## Build internals (matter when editing the bundler)

- `dist/tui.js` — **the `./tui` export target**; a single dual-format bundle (`{ id, tui, setup }`) built by esbuild from `src/tui.ts`, which combines `src/v1/index.tsx` (V1 `tui`) and `src/v2/index.tsx` (V2 `setup`). V1 hosts read `tui`, V2 hosts read `setup` (V2 validates `id` + `setup` only; extra fields are fine). This is the ONLY published artifact — `tsc` runs `--noEmit` (typecheck only) and `files` is `["dist"]`.
- No `./server` export: this plugin is TUI-only; `src/server.ts` was removed and `exports["./server"]` deleted with it. Do not re-add a server entry without giving the V2 server process a valid `setup` no-op.
- `src/ui/panel.tsx` — the sidebar panel shared by both hosts; written against neutral contracts (`KvAdapter`, `PanelSignals`). V1 passes `api.kv` directly; V2 wraps `context.storage.store` (`src/v2/kv.ts`).
- `src/ui/quota-block.tsx` — the neutral bar base for provider integrations: one group = `title` + `bar` + optional `resetTime` (display-ready string; caller owns i18n). `bar` is a string in either `nn%` or `xx/yy` form; `parseBar` derives the fill, the color, and the placement — the percentage always sits right of the bar (derived from the ratio when `xx/yy`), while the `xx/yy` string itself sits right of the title (compact suffixes `K/M/B` and thousands separators understood; unparseable → neutral accent, empty fill, string stays on the bar line, never throws). **Every derived value in `QuotaBar` must be a `createMemo`** — Solid component bodies run once, so a plain `const` reading `props.width` freezes at mount (observed as stale bar widths after session switches until a refresh/fold re-created the node). `GlmQuotaPanel.renderQuotaBlock` maps the GLM payload onto this contract (bar = `xx/yy` when the API provides a total, else `nn%`); the atomcode (`status-v2` windows) and codearts (`statistics/plugin` credits) integrations are expected to feed the same shape.
- No `peerDependencies` on purpose: npm ≥7 auto-installs peers, so the host's plugin cache would pull `@opentui/*`, `solid-js`, `@opencode-ai/*` into the plugin's own `node_modules` — all dead weight (the host aliases/provides them) and a renderer-duplication hazard. They live in `devDependencies` for local typecheck/build only. Never re-add runtime deps: everything the bundle needs at runtime is either inlined (e.g. `strip-json-comments`) or host-aliased (`@opencode-ai/*`, `@opentui/*`, `solid-js` esbuild externals).
- esbuild `external`: `@opencode-ai/*`, `@opentui/*`, `solid-js` — these are **provided by the host at runtime**, never bundled. Inlining `@opentui/*` breaks the V2 renderer ("No renderer found").
- JSX transform uses `@opentui/solid` as `jsxImportSource` (not `solid-js`).

## V2 host quirks (do not regress)

- V2 TUI loads `exports["./tui"]` and validates the default export has a non-empty string `id` + function `setup` — a V1-only `{ id, tui }` module is rejected with "Invalid V2 TUI plugin module".
- `keymap.layer` must be called from a component render context: the V2 entry mounts a null-rendering `CommandRoot` in the always-present `app` slot, so slash commands survive sidebar hide/narrow (calling it inside `setup` throws "Keymap.Provider is missing").
- Theme: V2 tokens (`hue.interactive[300]`, `text.*`) are mapped to the V1 `TuiThemeCurrent` shape in `src/v2/theme.ts` before `buildPalette`.
- Persistence: V2 `context.storage.store` is adapted to the sync `KvAdapter` in `src/v2/kv.ts`; the same `glm_quota_panel.*` keys are used, so settings carry across hosts.
- Module cache: a running TUI caches ESM by URL — after patching the cache dir, a **fresh TUI process** is required (plugin reconciliation alone won't re-import changed files).

## Preview without publishing

Register the repo directory in the **TUI client config** `~/.config/opencode/cli.json`:

```jsonc
{
  "plugins": [
    {
      "package": "file:///C:/Users/wujun/Desktop/opencode/opencode-glm-vistatus",
    },
  ],
}
```

V2 resolves the directory through `exports["./tui"]` → `dist/tui.js` and loads it over the local `read` channel, which is hash-fingerprinted and watched — a rebuild is picked up by restarting the TUI, no cache patching. `plugins` belongs to **`cli.json`**, not `opencode.jsonc` (that file's `plugins` is the _server_ plugin list).

A **fresh TUI process** is required either way: a running TUI caches ESM by URL and reconciliation will not re-import changed files. `opencode service restart` refreshes the server-side view.

## Config: where each plugin list lives (V2)

| File                                | Field     | Used for                  |
| ----------------------------------- | --------- | ------------------------- |
| `~/.config/opencode/cli.json`       | `plugins` | TUI plugins (this plugin) |
| `~/.config/opencode/opencode.jsonc` | `plugins` | server plugins            |

`cli.json` replaces the layered V1 `tui.json(c)` files; the entry shape is `{ "package": "...", "options": {...} }`. `tui.jsonc` is V1-only and no longer read by V2's TUI.

## Key runtime quirks (do not regress)

- **Auth header: NO `"Bearer"` prefix** — `Authorization: <token>` raw. This is intentional and required by the GLM Monitor API (`src/api/client.ts:40`).
- **Credential discovery priority** (`src/utils/auth.ts`):
  1. V2 SQLite credential DB `~/.local/share/opencode/opencode.db` (`credential` table, `active = 1`, newest `time_updated` per integration; honors `OPENCODE_DB` / `XDG_DATA_HOME`; `node:sqlite` loaded lazily so hosts without it fall through). V2 is authoritative: it imports auth.json into the DB once and never writes that file back.
  2. `~/.local/share/opencode/auth.json` (XDG, cross-platform, V1 preferred)
  3. `%LOCALAPPDATA%/opencode/auth.json` (Windows legacy fallback)
  4. env `ZAI_API_KEY` / `ZHIPU_API_KEY` (alias `ZHIPUAI_API_KEY`)
- Credential lookup (DB + auth.json) only matches known provider IDs (`zhipuai-coding-plan`, `zai-coding-plan`, `zai`, `z-ai`, `z.ai`, `zhipu`, `zhipuai`) — entries under other IDs are ignored.
- **Provider-visibility gate (V2 only)**: `/glm-config` → 显示条件/Panel Visibility toggles `glm_quota_panel.providerFilter` (persisted KV, default **off = always show**). When on, the panel renders only while the prompt's selected provider matches `matchedProviders` **or that provider serves a live quota RPC** (see the external-provider-quotas bullet below; data-driven — a provider with its own quota data is relevant by construction). Read reactively via `context.ui.model.current()` (host ≥ v2.0.25; with the filter on, a host without it — or no selected model — keeps the panel hidden: strict match, no fallback). `matchedProviders` defaults to `CANDIDATE_PROVIDER_IDS` (`src/utils/auth.ts`, the same list credential lookup uses — single source of truth, never re-declare it). Providers outside this plugin (atomcode, codearts, …) must NOT be hardcoded here — they join via user config (the `matchedProviders: string[]` plugin option) or automatically through the RPC protocol. The gate lives in `ProviderGate` (`src/v2/index.tsx`), outside `GlmQuotaPanel` — hiding it unmounts the panel (timers cleaned up; remount re-enters the shared-record coordination, so no fetch storm). V1 has no model-query API and keeps always-show.
- **Manual source switch (V2 only)**: `/glm-config` → 手动切换供应商/Manual Provider Switch toggles `glm_quota_panel.manualSource` (default **off = panel identical to before**; the menu item mirrors the Panel Border pattern — `[开/关]` state in the title, on/off sub-select with ✓; enabling is REFUSED with an error toast while no external source has been discovered — the check reads the `quotaSources` KV key directly). While on, the sidebar's platform row becomes the switcher — the value shows the active source followed by a single ▶ next-hint (deliberately NO backward ◀ triangle: the cycle logic is next-only, a back triangle would be a lie) and the WHOLE row is one click target — `onMouseUp={cycleSource}` sits on the enclosing `<text>`, the hit-test unit (spans are text runs inside it, NOT independent click targets: `SpanProps` carries no event props and @opentui/solid's `setProperty` drops everything except `href`/`style` on text-node renderables, so a per-span handler is impossible — and do NOT re-add one on the `<text>` alongside span handlers if that ever changes: mouse events bubble up the parent chain via `Renderable.processMouseEvent`, which would double-advance per click). Clicking anywhere on the row advances to the next source (auto-follow → discovered providers → auto-follow, i.e. the GLM view when a GLM model is selected; there is deliberately NO separate "pin GLM" state — it would render identically to auto and read as a dead click). The choice is pinned via `glm_quota_panel.pin` and survives restarts. A pinned external source redirects the gate's probe target (`fetchProviderQuota(client, pinnedId)` — the probe is id-based, not selection-based) and overrides the visibility filter (explicit user choice wins); a pinned-but-empty source renders a single-line "no data" hint (`pinOffline`/`pinUnknown` — learned source = offline, unknown id = undiscovered) instead of silently falling back to GLM numbers. Pin semantics: `null` = auto, otherwise a lowercase provider id. The legacy value `"glm"` stays normalize-valid for old KV entries but is consumed as auto-follow — it never redirects the probe (as a non-null pin it still overrides the visibility filter). `normalizePin` runs ONCE, at restore (`restorePanelConfig`) — the single entry point for external data; after that every writer stores normalized values (candidate ids are pre-filtered to the same constraints), and the gate/panel consume the signal as-is. All row-derived values (`rowLabel`/`rowValue`/`rowGap`) are `createMemo`s — an IIFE-built row froze at mount and read as "cycling never returns to the GLM view". The cycle list is NOT a signal: the panel and the refusal check read `SOURCES_KEY` from `kv` directly (reactive on V2, whose `kv.get` goes through per-key Solid stores — `src/v2/kv.ts`; panel precedent: the shared-record memo).
- **Quota-source discovery (sweep + passive, V2 gate)**: the switcher's cycle list contains only providers that ever answered their `<id>.quota` RPC, kept in `glm_quota_panel.quotaSources` (`{id → {label, ts}}` — ts exists only to keep the cycle order stable across restarts; written via atomic `kv.update`; deliberately uncapped — the map holds one entry per quota plugin the user actually runs, single digits in practice). Primary path — **painless enumeration**: `client.provider.list()` (`GET /api/provider`, verified present AND working on the injected TUI client) resolves to a **bare array** of `{ id, name, models }` — NOT wrapped in `{ all, connected }` (that SDK shape misled the first implementation); unwrap tolerates exactly array / `.all`, nothing else. Host-provided, zero config, zero file reads; every non-GLM-alias candidate is probed once at mount and the ones that answer join the cycle list. Secondary path — passive learning: every snapshot the gate's track already fetches teaches one id (covers hosts where the list call fails; also keeps labels fresh). Sibling provider ids are never hardcoded here; unconfirmed candidates never enter the cycle list. V1 never runs the gate, so the KV key stays empty → `candList` `[]` → plain platform row, switch refused.
- **External provider quotas (the sibling-plugin RPC protocol, `src/utils/provider-quota.ts`)**: atomcode/codearts server plugins register `<providerID>.quota` with a `status` method on the host plugin-RPC domain (`ctx.rpc.register`, ≥ v2.0.25; the core RPC service is exposed to the TUI at `POST /api/rpc/<id>/<method>` via `context.client.rpc.call`), returning `{ label, groups: [{ title, bar, resetTime? }] }` — `bar` follows the QuotaBar string contract, `title`/`resetTime` are display-ready (the WRITER owns i18n). This panel never hardcodes sibling ids: the V2 gate probes the channel by convention (`<selected provider id>.quota`, 30 s cadence + per-provider 120 s backoff after failures — switching providers probes immediately, `createExternalRecordTrack`) and, on a well-formed snapshot, renders the provider's `label` in the header and its groups through `QuotaBar` instead of the GLM data — switch providers and the data source follows. Data is live (no staleness window): handlers serve fresh/short-cached snapshots and degrade to empty groups, which renders as "no data". Adding a provider = it starts serving the RPC; zero changes here. RPC (not a file bridge) because `context.client` is a first-class, version-matched (v2.0.25) cross-process channel: the provider owns freshness and nothing couples to filesystem conventions. V1 never renders external quotas (no model query → `signals.externalRecord` undefined). **Track quirk (do not regress)**: on a probe-target switch the track's effect synchronously drops any snapshot belonging to the previous target — a failed target's 120 s backoff early-returns BEFORE `setRecord`, so without that explicit clear a stale external snapshot would keep rendering after the user cycles back to auto (observed as "the switcher never returns to the GLM view").
- `fetch()` + `AbortController` 10s timeout; `Promise.allSettled` so one failed endpoint doesn't blank the panel (graceful degradation).
- Auto-refresh via `setInterval` (default 5 min, configurable via `/glm-config`); first fetch on mount.
- **Cross-session refresh coordination** (`src/utils/shared-record.ts`): all sessions share one record in the host KV under `glm_quota_panel.shared`, so a refresh window triggers a single GLM Monitor API fetch instead of one per session.
  - **V2**: `context.storage.store` is durable and **live-synced across running TUI instances** (the host file-watches its store dir and reconciles remote writes), so the panel adopts other sessions' records reactively (`createEffect` on the store) and claims the fetch **atomically** via `KvAdapter.update` (runs inside the host's file-locked read-modify-write — exactly one claimer wins). A crashed holder's claim expires after 15s.
  - **V1**: `api.kv` is a plain get/set store without cross-process guarantees, so claiming is skipped; random jitter (150–900ms) plus a re-read before fetching staggers sessions. V1 is nearly unsupported — this simple behavior is intentional.
  - Forced refresh (`/glm-refresh`) bypasses the freshness window (interval − 10s slack, min 15s) but still goes through the claim, so concurrent forces collapse too. The record carries only API responses plus an FNV-1a `tokenHash` (never the token); failure records are shared so every session shows the error without refetching.
- Quota color logic is **inverted** from typical cache plugins: higher usage = redder (`<70%` green, `70-90%` orange, `>=90%` red).
- **Debug env**: `GLM_VISTATUS_LANG=zh|en` forces the UI language (bypasses auto-detection) for testing i18n.
- **MCP config files**: `opencode.json` and `opencode.jsonc` are both legal (OpenCode merges them, jsonc wins). The picker unions `mcp` entries from both; installs write to the file already holding `mcp` (jsonc preferred), uninstalls delete the server from every file that declares it.

## Slash commands (registered in `src/v1/commands.tsx` and `src/v2/commands.ts`)

| Command           | Action                                                          |
| ----------------- | --------------------------------------------------------------- |
| `/glm-refresh`    | Force-refresh quota data immediately                            |
| `/glm-config`     | Interactive settings: language / border / refresh interval / visibility (V2) |
| `/glm-mcp-manage` | Install / uninstall GLM MCP servers (alias: `/glm-mcp-install`) |

Language, border and refresh-interval preferences are persisted via plugin KV and survive restarts. Refresh interval: presets 1/2/5/10/30/60 min + custom (1–1440 min, validated in `/glm-config`), default 5 min, timer reschedules reactively when changed.

## Install / registration

Users register the plugin by package spec and the host installs it from npm automatically:

- **V2**: `cli.json` → `plugins: [{ package: "opencode-glm-vistatus" }]` — the OpenCode `install plugin` palette command edits this for you.
- **V1**: `tui.jsonc` → `plugin: ["opencode-glm-vistatus"]`.

There is no `bin` installer: `install.mjs` (the npx flow) was removed — it duplicated the host's own install command, and its entrypoint had silently been broken (strip-json-comments v5 named import) with no reports. Plugin spec is the bare string `"opencode-glm-vistatus"` (no `@latest`).
