# AGENTS.md

OpenCode TUI plugin — real-time GLM Coding Plan quota in the sidebar.
User-facing docs (install / slash commands / build steps) live in
README.md（简体中文）/ README.en.md — this file is dev-facing only.

## Build & Development

Beyond the README build block: `npm run build:tui` (esbuild bundle only, skips
tsc), `npm run inspect` (live API debug: fetches real quota data & prints each
step, needs creds). No test suite exists — verify changes with
`npm run typecheck && npm run build`.

### Versioning: `VERSION.txt` is the single source of truth

Never hand-edit `package.json`'s `version` — `npm run sync-version` copies
`VERSION.txt` → `package.json` + `src/_version.ts` (generated, gitignored,
never hand-edit or commit it; the bundle build fails without it).
`prepublishOnly` runs sync-version + build, so npm publish never hits the
missing-file issue.

- `release.yml` (manual `workflow_dispatch`): bumps per rule (`minor+1, patch=0`; `minor>=10` rolls over to `major+1`), syncs package.json AND package-lock.json (`npm install --package-lock-only`), commits, tags `vX.Y.Z`, creates a GitHub Release. That VERSION.txt commit then triggers `publish.yml`.
- `publish.yml`: fires on any `VERSION.txt` change on `main` → syncs, builds, `npm publish --provenance --access public`, commits the synced `package.json` back to `main` (usually a no-op — release.yml already synced it).

## Build internals (matter when editing the bundler)

- `dist/tui.js` — **the `./tui` export target**; a single dual-format bundle (`{ id, tui, setup }`) built by esbuild from `src/tui.ts`, which combines `src/v1/index.tsx` (V1 `tui`) and `src/v2/index.tsx` (V2 `setup`). V1 hosts read `tui`, V2 hosts read `setup` (V2 validates `id` + `setup` only; extra fields are fine). `tsc` runs `--noEmit` (typecheck only) and `files` is `["dist"]`.
- `dist/index.js` — **the `./server` export target** (added after being deleted as dead code): a V2 server plugin (`{ id, setup }`) that serves the GLM quota as `<providerID>.quota` RPCs — one shared `status` handler registered under every id in `CANDIDATE_PROVIDER_IDS` (the rpcID must equal the user's provider id, which is user-chosen). The snapshot mirrors the native sidebar view 1:1: label "GLM", a label group (`{ title, value }`, rendered as right-aligned key/value rows — bare `title`, the panel renders the trailing `title:` colon itself) for 套餐, bar groups for 5h/周/MCP with raw `resetTime` timestamps (Unix epoch ms — the panel renders the countdown + clock line itself), shared i18n for titles (`getTranslations(detectLangZH())`). The platform row is NOT in the snapshot — the panel renders its own natively, and a duplicate would repeat. 30s cache, degrade-to-empty-groups, safe no-op without the rpc domain. Loaded ONLY when the package appears in the server plugin list (`opencode.json[c]`) or a `plugins/` directory — `cli.json` entries stay TUI-only and the sidebar keeps its direct fetch (fallback by construction, see the config table below). Writer-side contract: `docs/quota-rpc.md`. **Two host quirks (verified live 2026-11-21, host v2.3.0)**: (1) the output file must be named `index.js` — local-directory config entries load `<dir>/index.js`, NOT the package exports map (the sibling providers ship `dist/index.js` for exactly this reason); (2) RPC registration MUST use the schema form (`register({ id, methods: {…schema…}, events: {} }, { status })`) — the short form (`register("x.quota", { status })`) silently fails to register on ≥ v2.3 (zcode's short-form RPC answers `rpc.unavailable` while atomcode's schema-form answers `rpc.invalid_input` for malformed probes). Manual RPC probe envelope: `POST /api/rpc/<id>.quota/status` with body `{"input":{}}` (bare `{}` fails input validation).
- No `bin` installer — `install.mjs` (the npx flow) was removed (it duplicated the host's own install command and its entrypoint was silently broken: strip-json-comments v5 named import). Do not re-add.
- `src/ui/panel.tsx` — the sidebar panel shared by both hosts; written against neutral contracts (`KvAdapter`, `PanelSignals`). V1 passes `api.kv` directly; V2 wraps `context.storage.store` (`src/v2/kv.ts`).
- `src/ui/quota-block.tsx` — the neutral bar base for provider integrations: one group = `title` + `bar` + optional `resetTime` (display-ready string; caller owns i18n). `bar` is a string in either `nn%` or `xx/yy` form; `parseBar` derives the fill, the color, and the placement — the percentage always sits right of the bar (derived from the ratio when `xx/yy`), while the `xx/yy` string itself sits right of the title (compact suffixes `K/M/B` and thousands separators understood; unparseable → neutral accent, empty fill, string stays on the bar line, never throws). **Every derived value in `QuotaBar` must be a `createMemo`** — Solid component bodies run once, so a plain `const` reading `props.width` freezes at mount (observed as stale bar widths after session switches until a refresh/fold re-created the node). Same pitfall, label flavor: the right-aligned label rows (平台/套餐/external label groups) render through the `LabelRow` component — a plain `labeledValue()` helper call froze its gap at the mount-time `panelWidth()`, which starts at `DEFAULT_PANEL_WIDTH` and only reaches its real value after the first layout (observed live 2026-11-21). `GlmQuotaPanel.renderQuotaBlock` maps the GLM payload onto this contract (bar = `xx/yy` when the API provides a total, else `nn%`); the atomcode (`status-v2` windows) and codearts (`statistics/plugin` credits) integrations are expected to feed the same shape.
- No `peerDependencies` on purpose: npm ≥7 auto-installs peers, so the host's plugin cache would pull `@opentui/*`, `solid-js`, `@opencode-ai/*` into the plugin's own `node_modules` — all dead weight (the host aliases/provides them) and a renderer-duplication hazard. They live in `devDependencies` for local typecheck/build only. Never re-add runtime deps: everything the bundle needs at runtime is either inlined (e.g. `strip-json-comments`) or host-aliased (`@opencode-ai/*`, `@opentui/*`, `solid-js` esbuild externals).
- esbuild `external`: `@opencode-ai/*`, `@opentui/*`, `solid-js` — these are **provided by the host at runtime**, never bundled. Inlining `@opentui/*` breaks the V2 renderer ("No renderer found").
- JSX transform uses `@opentui/solid` as `jsxImportSource` (not `solid-js`).

## V2 host quirks (do not regress)

- V2 TUI loads `exports["./tui"]` and validates the default export has a non-empty string `id` + function `setup` — a V1-only `{ id, tui }` module is rejected with "Invalid V2 TUI plugin module".
- `keymap.layer` must be called from a component render context: the V2 entry mounts a null-rendering `CommandRoot` in the always-present `app` slot, so slash commands survive sidebar hide/narrow (calling it inside `setup` throws "Keymap.Provider is missing").
- Theme: V2 tokens (`hue.interactive[300]`, `text.*`) are mapped to the V1 `TuiThemeCurrent` shape in `src/v2/theme.ts` before `buildPalette`.
- Persistence: V2 `context.storage.store` is adapted to the sync `KvAdapter` in `src/v2/kv.ts`; the same `glm_quota_panel.*` keys are used, so settings carry across hosts.
- Module cache: a running TUI caches ESM by URL. **Hot reload works for local `file:///` directory entries** (hash-fingerprinted + watched — a rebuild appears in the running TUI by itself, observed live 2026-11-21). Only the plugin **cache-dir** path (patching the host's cached copy of an npm-installed package) needs a fresh TUI process — the cache URL never changes, so reconciliation keeps importing the stale file.

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

V2 resolves the directory through `exports["./tui"]` → `dist/tui.js` and loads it over the local `read` channel, which is hash-fingerprinted and watched — a rebuild is **hot-loaded by the running TUI**, no restart, no cache patching (observed live 2026-11-21: panel code changes appear in the running TUI by themselves). `plugins` belongs to **`cli.json`**, not `opencode.jsonc` (that file's `plugins` is the _server_ plugin list).

`opencode service restart` refreshes the server-side view; the TUI side needs nothing manual.

## Config: where each plugin list lives (V2)

| File                                | Field     | Used for                  |
| ----------------------------------- | --------- | ------------------------- |
| `~/.config/opencode/cli.json`       | `plugins` | TUI plugins (this plugin) |
| `~/.config/opencode/opencode.jsonc` | `plugins` | server plugins            |

`cli.json` replaces the layered V1 `tui.json(c)` files; the entry shape is `{ "package": "...", "options": {...} }`. `tui.jsonc` is V1-only and no longer read by V2's TUI.

**Verified against host v2.3.0** (binary grep + `packages/tui/src/plugin/context.tsx`): `opencode plugin add` inspects the package's export type and writes exactly ONE file — TUI-only packages → `cli.json`, packages with a server side → `opencode.json(c)`; it never double-writes. But loading is unified: the TUI's desired plugin list merges `serverTuiPlugins()` (the server's inventory filtered to `features.tui === true` active packages — "server inventory carries combined plugins. Their overlap is intentional") with `cli.json` `plugins` and local `plugins/` directories. Net effect: an `opencode.json` entry loads BOTH sides of a dual-export package; a `cli.json` entry loads TUI only (our server export stays dormant until the package is also in the server list — by-design fallback, not a bug).

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
- **Quota-source discovery (mount sweep + passive, V2 gate)**: the switcher's cycle list = providers that ever answered their `<id>.quota` RPC, kept in `glm_quota_panel.quotaSources` (`{id → {label, ts}}` — ts keeps the cycle order stable across restarts; written via atomic `kv.update`; uncapped — one entry per quota plugin in practice). Two paths, **no id excluded — sibling plugins and this plugin's own `./server` export are equal**: (1) **mount sweep** — `client.provider.list()` (`GET /api/provider`, verified live: bare array of `{ id, name, models }`; the `{ all }` SDK shape is tolerated, nothing else) probed once per TUI start, every answering id joins; (2) **passive learning** — every snapshot the gate's track fetches teaches its id (this is how a provider hot-loaded after mount gets in: select its model once, the probe answers, the id is learned). `learnSource` dedupes by **display label** — one cycle entry per label, so the seven GLM credential aliases this plugin's server registers collapse into a single generic-rule entry (no id list anywhere in the code). Sibling provider ids are never hardcoded; unconfirmed candidates never enter the cycle list. V1 never runs the gate, so the KV key stays empty → `candList` `[]` → plain platform row, switch refused.
- **Direct-fetch discipline (provider-agnostic)**: `refresh()` runs the GLM Monitor fetch only while the GLM view is actually displayed (`showGlm`); any live external snapshot — the plugin's own `./server` export or a sibling's — suppresses the shared-record claim + network entirely (the panel shows one source at a time, so displayed data is never also fetched directly — the old double-fetch residual is gone). Platform-name resolution still runs (the switcher row needs it); when the GLM view returns (server quiet, pin cleared), the next tick or remount fetches again. V1 (no `externalRecord`) is unchanged.
- **External provider quotas (the sibling-plugin RPC protocol, `src/utils/provider-quota.ts`)**: atomcode/codearts server plugins register `<providerID>.quota` with a `status` method on the host plugin-RPC domain (`ctx.rpc.register`, ≥ v2.0.25; the core RPC service is exposed to the TUI at `POST /api/rpc/<id>/<method>` via `context.client.rpc.call`), returning `{ label, groups: [{ title, bar, resetTime? } | { title, value }] }` — `bar` follows the QuotaBar string contract, `title`/`value` are display-ready (the WRITER owns i18n), and `resetTime` is raw `Time` (Unix epoch ms): the READER renders the countdown + clock/day line against its own now (`resetLineOf`, shared with the GLM path; weekday appears once the horizon exceeds 12h — `formatResetClock`). This panel never hardcodes sibling ids: the V2 gate probes the channel by convention (`<selected provider id>.quota`, 30 s cadence + per-provider 120 s backoff after failures — switching providers probes immediately, `createExternalRecordTrack`) and, on a well-formed snapshot, renders the provider's `label` in the header and its groups through `QuotaBar` instead of the GLM data — switch providers and the data source follows. Data is live (no staleness window): handlers serve fresh/short-cached snapshots and degrade to empty groups, which renders as "no data". Adding a provider = it starts serving the RPC; zero changes here. RPC (not a file bridge) because `context.client` is a first-class, version-matched (v2.0.25) cross-process channel: the provider owns freshness and nothing couples to filesystem conventions. V1 never renders external quotas (no model query → `signals.externalRecord` undefined). Writer-side contract + the "expose your own provider's quota" recipe live in `docs/quota-rpc.md` — keep it in sync when touching `src/utils/provider-quota.ts` or `createExternalRecordTrack`. **Track quirk (do not regress)**: on a probe-target switch the track's effect synchronously drops any snapshot belonging to the previous target — a failed target's 120 s backoff early-returns BEFORE `setRecord`, so without that explicit clear a stale external snapshot would keep rendering after the user cycles back to auto (observed as "the switcher never returns to the GLM view").
- `fetch()` + `AbortController` 10s timeout; `Promise.allSettled` so one failed endpoint doesn't blank the panel (graceful degradation).
- Auto-refresh via `setInterval` (default 5 min, configurable via `/glm-config`); first fetch on mount.
- **Cross-session refresh coordination** (`src/utils/shared-record.ts`): all sessions share one record in the host KV under `glm_quota_panel.shared`, so a refresh window triggers a single GLM Monitor API fetch instead of one per session.
  - **V2**: `context.storage.store` is durable and **live-synced across running TUI instances** (the host file-watches its store dir and reconciles remote writes), so the panel adopts other sessions' records reactively (`createEffect` on the store) and claims the fetch **atomically** via `KvAdapter.update` (runs inside the host's file-locked read-modify-write — exactly one claimer wins). A crashed holder's claim expires after 15s.
  - **V1**: `api.kv` is a plain get/set store without cross-process guarantees, so claiming is skipped; random jitter (150–900ms) plus a re-read before fetching staggers sessions. V1 is nearly unsupported — this simple behavior is intentional.
  - Forced refresh (`/glm-refresh`) bypasses the freshness window (interval − 10s slack, min 15s) but still goes through the claim, so concurrent forces collapse too. The record carries only API responses plus an FNV-1a `tokenHash` (never the token); failure records are shared so every session shows the error without refetching.
- Quota color logic is **inverted** from typical cache plugins: higher usage = redder (`<70%` green, `70-90%` orange, `>=90%` red).
- **Quota window type tags differ by plan/platform**: z.ai (and bigmodel.cn Pro accounts — verified live, same token hits both endpoints) tag usage windows `TOKENS_LIMIT`; bigmodel.cn Lite plans tag the identical shape `CREDIT_LIMIT` (PR #2, merged as `c1f35ce`). The parser normalizes the tag ONCE at the boundary (`normalizeWindowType` in `src/utils/quota-parser.ts`, applied via `.map()` right after `limits` is read) so every window matcher and the fallback scan stay single-type — do NOT fold it back into per-check two-tag `||`s, and do NOT re-add a per-window `credit` flag or a separate i18n label (deliberately removed in the KISS pass; one "5h" label serves both origins).
- **Debug env**: `GLM_VISTATUS_LANG=zh|en` forces the UI language (bypasses auto-detection) for testing i18n.
- **MCP config files**: `opencode.json` and `opencode.jsonc` are both legal (OpenCode merges them, jsonc wins). The picker unions `mcp` entries from both; installs write to the file already holding `mcp` (jsonc preferred), uninstalls delete the server from every file that declares it.

## Slash commands

The command table lives in README; registered in `src/v1/commands.tsx` +
`src/v2/commands.ts`. Language / border / refresh-interval prefs persist via
plugin KV and survive restarts; refresh interval presets 1/2/5/10/30/60 min +
custom (1–1440 min, validated in `/glm-config`), default 5 min, timer
reschedules reactively on change.

## Install / registration

User steps live in README (V2 `cli.json` `plugins` / V1 `tui.jsonc` `plugin`;
the host's `install plugin` palette writes them). Dev-relevant facts: plugin
spec is the bare string `"opencode-glm-vistatus"` (no `@latest`); NO `bin`
installer — `install.mjs` (the npx flow) was removed (it duplicated the host's
own install command and its entrypoint was silently broken:
strip-json-comments v5 named import). Do not re-add.
