# AGENTS.md

OpenCode TUI plugin — real-time GLM Coding Plan quota in the sidebar.

## Build & Development

```bash
npm install          # install dev deps only (runtime deps are host-provided)
npm run build        # tsc --noEmit (typecheck) && esbuild bundle → dist/tui.js (the only artifact)
npm run typecheck    # tsc --noEmit
npm run build:tui    # esbuild bundle only (skips tsc)
npm run inspect      # live API debug: fetches real quota data & prints each step (needs creds)
node scripts/preview.mjs  # overlay the build into opencode's plugin cache for instant preview
```

No test suite exists. Verify changes with `npm run typecheck && npm run build`.

### Versioning: `VERSION.txt` is the single source of truth

`VERSION.txt` (e.g. `0.1.0`) drives everything — never hand-edit `package.json`'s
`version` directly. `npm run sync-version` copies `VERSION.txt` → `package.json` + `src/_version.ts` from it. `prepublishOnly` runs both automatically.

- `release.yml` (manual `workflow_dispatch`): bumps per rule (`minor+1, patch=0`;
  `minor>=10` rolls over to `major+1`), commits, tags `vX.Y.Z`, creates a GitHub
  Release. That VERSION.txt commit then triggers `publish.yml`.
- `publish.yml`: fires on any `VERSION.txt` change on `main` → syncs, builds,
  `npm publish --provenance --access public`. Requires `NPM_TOKEN` secret.

### `src/_version.ts` is generated & gitignored

`scripts/sync-version.mjs` auto-creates it from `package.json` if missing; without it the
bundle build fails. Never hand-edit or commit it.

## Build internals (matter when editing the bundler)

- `dist/tui.js` — **the `./tui` export target**; a single dual-format bundle
  (`{ id, tui, setup }`) built by esbuild from `src/tui.ts`, which combines
  `src/v1/index.tsx` (V1 `tui`) and `src/v2/index.tsx` (V2 `setup`). V1 hosts read
  `tui`, V2 hosts read `setup` (V2 validates `id` + `setup` only; extra fields
  are fine). This is the ONLY published artifact — `tsc` runs `--noEmit`
  (typecheck only) and `files` is `["dist"]`; a future `./server` would add
  `dist/server.js` beside it.
- No `./server` export: this plugin is TUI-only; `src/server.ts` was removed and
  `exports["./server"]` deleted with it. Do not re-add a server entry without
  giving the V2 server process a valid `setup` no-op.
- `src/ui/panel.tsx` — the sidebar panel shared by both hosts; written
  against neutral contracts (`KvAdapter`, `PanelSignals`). V1 passes `api.kv`
  directly; V2 wraps `context.storage.store` (`src/v2/kv.ts`).
- No `peerDependencies` on purpose: npm ≥7 auto-installs peers, so the host's
  plugin cache would pull `@opentui/*`, `solid-js`, `@opencode-ai/*` into the
  plugin's own `node_modules` — all dead weight (the host aliases/provides
  them) and a renderer-duplication hazard. They live in `devDependencies`
  for local typecheck/build only. Never re-add runtime deps: everything the
  bundle needs at runtime is either inlined (e.g. `strip-json-comments`) or
  host-aliased (`@opencode-ai/*`, `@opentui/*`, `solid-js` esbuild externals).
- esbuild `external`: `@opencode-ai/*`, `@opentui/*`, `solid-js` — these are
  **provided by the host at runtime**, never bundled. Inlining
  `@opentui/*` breaks the V2 renderer ("No renderer found").
- JSX transform uses `@opentui/solid` as `jsxImportSource` (not `solid-js`).

## V2 host quirks (do not regress)

- V2 TUI loads `exports["./tui"]` and validates the default export has a
  non-empty string `id` + function `setup` — a V1-only `{ id, tui }` module is
  rejected with "Invalid V2 TUI plugin module".
- `keymap.layer` must be called from a component render context: the V2 entry
  mounts a null-rendering `CommandRoot` in the always-present `app` slot, so
  slash commands survive sidebar hide/narrow (calling it inside `setup` throws
  "Keymap.Provider is missing").
- Theme: V2 tokens (`hue.interactive[300]`, `text.*`) are mapped to the V1
  `TuiThemeCurrent` shape in `src/v2/theme.ts` before `buildPalette`.
- Persistence: V2 `context.storage.store` is adapted to the sync `KvAdapter`
  in `src/v2/kv.ts`; the same `glm_quota_panel.*` keys are used, so settings
  carry across hosts.
- Module cache: a running TUI caches ESM by URL — after patching the cache dir,
  a **fresh TUI process** is required (plugin reconciliation alone won't
  re-import changed files).

## Preview without publishing

Two supported ways to run a local build:

1. **`file://` package spec (preferred, verified).** Register the repo
   directory in the **TUI client config** `~/.config/opencode/cli.json`:

   ```jsonc
   {
     "plugins": [
       {
         "package": "file:///C:/Users/wujun/Desktop/opencode/opencode-glm-vistatus",
       },
     ],
   }
   ```

   V2 resolves the directory through `exports["./tui"]` → `dist/tui.js` and
   loads it over the local `read` channel, which is hash-fingerprinted and
   watched — a rebuild is picked up by restarting the TUI, no cache patching.
   `plugins` belongs to **`cli.json`**, not `opencode.jsonc` (that file's
   `plugins` is the _server_ plugin list).

2. **Cache overlay.** `node scripts/preview.mjs` overlays `package.json`,
   `dist/`, `src/` into every cached install under
   `~/.cache/opencode/` (both `packages/<spec>` and `npm/<spec>/<timestamp>`
   — the latter is what npm-spec resolution loads). Keep the cached `version`
   equal to the registry version so the resolver does not reinstall.

Either way a **fresh TUI process** is required: a running TUI caches ESM by
URL and reconciliation will not re-import changed files.
`opencode service restart` refreshes the server-side view.

## Config: where each plugin list lives (V2)

| File                                | Field     | Used for                  |
| ----------------------------------- | --------- | ------------------------- |
| `~/.config/opencode/cli.json`       | `plugins` | TUI plugins (this plugin) |
| `~/.config/opencode/opencode.jsonc` | `plugins` | server plugins            |

`cli.json` replaces the layered V1 `tui.json(c)` files; the entry shape is
`{ "package": "...", "options": {...} }`. `tui.jsonc` is V1-only and no longer
read by V2's TUI.

## Key runtime quirks (do not regress)

- **Auth header: NO `"Bearer"` prefix** — `Authorization: <token>` raw. This is
  intentional and required by the GLM Monitor API (`src/api/client.ts:40`).
- **Credential discovery priority** (`src/utils/auth.ts`):
  1. `~/.local/share/opencode/auth.json` (XDG, cross-platform, preferred)
  2. `%LOCALAPPDATA%/opencode/auth.json` (Windows legacy fallback)
  3. env `ZAI_API_KEY` / `ZHIPU_API_KEY` (alias `ZHIPUAI_API_KEY`)
- auth.json lookup only matches known provider IDs (`zhipuai-coding-plan`,
  `zai-coding-plan`, `zai`, `zhipu`, …) — entries under other IDs are ignored.
- `fetch()` + `AbortController` 10s timeout; `Promise.allSettled` so one failed
  endpoint doesn't blank the panel (graceful degradation).
- Auto-refresh via `setInterval` (default 5 min, configurable via `/glm-config`); first fetch on mount.
- Quota color logic is **inverted** from typical cache plugins: higher usage =
  redder (`<70%` green, `70-90%` orange, `>=90%` red).
- **Debug env**: `GLM_VISTATUS_LANG=zh|en` forces the UI language (bypasses
  auto-detection) for testing i18n.
- **MCP config files**: `opencode.json` and `opencode.jsonc` are both legal
  (OpenCode merges them, jsonc wins). The picker unions `mcp` entries from
  both; installs write to the file already holding `mcp` (jsonc preferred),
  uninstalls delete the server from every file that declares it.

## Slash commands (registered in `src/v1/commands.tsx` and `src/v2/commands.ts`)

| Command           | Action                                                          |
| ----------------- | --------------------------------------------------------------- |
| `/glm-refresh`    | Force-refresh quota data immediately                            |
| `/glm-config`     | Interactive settings: language / border / refresh interval      |
| `/glm-mcp-manage` | Install / uninstall GLM MCP servers (alias: `/glm-mcp-install`) |

Language, border and refresh-interval preferences are persisted via plugin KV
and survive restarts. Refresh interval: presets 1/2/5/10/30/60 min + custom
(1–1440 min, validated in `/glm-config`), default 5 min, timer reschedules
reactively when changed.

## Install / registration

Users register the plugin by package spec and the host installs it from npm
automatically:

- **V2**: `cli.json` → `plugins: [{ package: "opencode-glm-vistatus" }]` —
  the OpenCode `install plugin` palette command edits this for you.
- **V1**: `tui.jsonc` → `plugin: ["opencode-glm-vistatus"]`.

There is no `bin` installer: `install.mjs` (the npx flow) was removed — it
duplicated the host's own install command, and its entrypoint had silently
been broken (strip-json-comments v5 named import) with no reports. Plugin
spec is the bare string `"opencode-glm-vistatus"` (no `@latest`).
