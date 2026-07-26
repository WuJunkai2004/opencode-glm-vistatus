# AGENTS.md

OpenCode TUI plugin — real-time GLM Coding Plan quota in the sidebar.

## Build & Development

```bash
npm install          # install deps (peer deps are host-provided, see below)
npm run build        # tsc (emit + declarations) && esbuild bundle → dist/tui.js
npm run typecheck    # tsc --noEmit
npm run build:tui    # esbuild bundle only (skips tsc)
```

No test suite exists. Verify changes with `npm run typecheck && npm run build`.

### Versioning: `VERSION.txt` is the single source of truth

`VERSION.txt` (e.g. `0.1.0`) drives everything — never hand-edit `package.json`'s
`version` directly. `npm run sync-version` copies `VERSION.txt` → `package.json`,
then `npm run version` regenerates `src/_version.ts` from it. `prepublishOnly`
runs both automatically.

- `release.yml` (manual `workflow_dispatch`): bumps per rule (`minor+1, patch=0`;
  `minor>10` rolls over to `major+1`), commits, tags `vX.Y.Z`, creates a GitHub
  Release. That VERSION.txt commit then triggers `publish.yml`.
- `publish.yml`: fires on any `VERSION.txt` change on `main` → syncs, builds,
  `npm publish`. Requires the `NPM_TOKEN` repo secret.

### Gotcha: `src/_version.ts` is generated & gitignored

`build.tui.mjs` auto-creates it from `package.json` if missing; without it the
bundle build fails. Never hand-edit or commit it.

## Build internals (matter when editing the bundler)

- `dist/tui.js` — the **only** artifact actually loaded as the TUI plugin; built
  by esbuild from `src/index.tsx`.
- `dist/server.js` + `*.d.ts` — emitted by `tsc` from `src/server.ts`.
- esbuild `external`: `@opencode-ai/*`, `@opentui/*`, `solid-js` — these are
  **peer deps provided by the OpenCode host at runtime**, never bundled.

## Architecture

- **TUI plugin** (sidebar): `src/index.tsx` — SolidJS `GlmQuotaPanel` (625 lines).
- **Server shell**: `src/server.ts` — empty `PluginModule` (compatibility only).
- **API layer**: `src/api/` — `endpoints.ts` (3 endpoints/platform),
  `platforms.ts` (Z.AI vs ZHIPU detection), `client.ts` (fetch + timeout).
- **Utils**: `src/utils/` — `auth.ts`, `quota-parser.ts`, `time-window.ts`, `format.ts`.
- **UI helpers**: `src/ui/` — `widgets.ts` (CJK width, progress bar),
  `theme.ts` (Morandi palette), `i18n.ts` (zh/en).

## Key runtime quirks (do not regress)

- **Auth header: NO `"Bearer"` prefix** — `Authorization: <token>` raw. This is
  intentional and required by the GLM Monitor API (`src/api/client.ts:40`).
- **Credential discovery priority** (`src/utils/auth.ts`):
  1. `~/.local/share/opencode/auth.json` (XDG, cross-platform, preferred)
  2. `%LOCALAPPDATA%/opencode/auth.json` (Windows legacy fallback)
  3. env `ZAI_API_KEY` / `ZHIPU_API_KEY`
- `fetch()` + `AbortController` 10s timeout; `Promise.allSettled` so one failed
  endpoint doesn't blank the panel (graceful degradation).
- 5-minute auto-refresh via `setInterval`; first fetch on mount.
- Quota color logic is **inverted** from typical cache plugins: higher usage =
  redder (`<70%` green, `70-90%` orange, `>=90%` red).
- **Debug env**: `GLM_VISTATUS_LANG=zh|en` forces the UI language (bypasses
  auto-detection) for testing i18n.

## Install / registration

`npx opencode-glm-vistatus` runs `install.mjs`, which writes the plugin spec
into the cross-platform opencode config dir (`~/.config/opencode/tui.jsonc`, or
`%APPDATA%/opencode/tui.jsonc` on Windows). Plugin spec is the bare string
`"opencode-glm-vistatus"` (no `@latest`).

## Reference Projects (not in this repo)

Patterns adapted from upstream plugins — consult if behavior is unclear:
- `opencode-glm-quota` — API endpoints, auth discovery, quota parsing.
- `opencode-visual-cache` — TUI rendering, SolidJS, theme, CJK width, commands.
