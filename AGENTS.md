# AGENTS.md

OpenCode TUI plugin — real-time GLM Coding Plan quota in the sidebar.

## Build & Development

```bash
npm install          # install deps
npm run build        # tsc + esbuild bundle → dist/tui.js + dist/server.js
npm run typecheck    # tsc --noEmit
```

## Architecture

- **TUI plugin** (sidebar): `src/index.tsx` — SolidJS `GlmQuotaPanel` component
- **Server shell**: `src/server.ts` — empty `PluginModule` (compatibility)
- **API layer**: `src/api/` — endpoints, platform detection, fetch client
- **Utils**: `src/utils/` — auth discovery, quota parsing, time window, formatting
- **UI helpers**: `src/ui/` — CJK width, theme/colors, i18n

## Key Design Decisions

- `fetch()` instead of `node:https` (Bun runtime native support)
- `Promise.allSettled` for graceful degradation (partial data shown)
- 5-minute auto-refresh via `setInterval`
- Morandi desaturated colors (from opencode-visual-cache)
- Quota color logic is **inverted** from visual-cache: higher usage = redder

## Reference Projects

- `opencode-glm-quota` — API endpoints, auth discovery, quota parsing
- `opencode-visual-cache` — TUI rendering, SolidJS, theme, CJK width, commands
