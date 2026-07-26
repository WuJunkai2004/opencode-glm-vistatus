# opencode-glm-vistatus

English | [简体中文](./README.md)

> OpenCode TUI plugin — real-time Z.AI / ZHIPU GLM Coding Plan quota usage in the sidebar.

---

## Features

- 5-hour token quota (percentage + progress bar)
- Weekly token quota (percentage + progress bar)
- MCP tool usage (percentage + progress bar)
- Tokens used / total
- Reset countdown + local clock
- Account plan tier (Pro / Lite, etc.)
- Platform info (Z.AI / ZHIPU)
- Last refresh time + next refresh estimate
- Auto-refresh every 5 minutes
- Bilingual: Chinese / English
- Morandi-style theme adaptation
- Progress bar color shifts with usage (green → orange → red)

## Installation

### Option 1: npm install (recommended)

```bash
npm install opencode-glm-vistatus
npx opencode-glm-vistatus
```

The install script automatically updates `tui.jsonc` in the cross-platform
OpenCode config directory to register the plugin.

### Option 2: manual configuration

Add the plugin to `tui.jsonc` in your config directory:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-glm-vistatus"]
}
```

| OS | Config directory |
|----|------------------|
| Windows | `%APPDATA%\opencode\` |
| macOS / Linux | `~/.config/opencode/` |

Restart OpenCode to see the GLM quota panel in the sidebar.

## Prerequisites

1. Authenticate your Z.AI / ZHIPU account via the `/connect` command, or
2. Set the `ZAI_API_KEY` / `ZHIPU_API_KEY` environment variables

Credential discovery priority: XDG `~/.local/share/opencode/auth.json` →
Windows `%LOCALAPPDATA%\opencode\auth.json` → environment variables.

## Slash Commands

| Command | Action |
|---------|--------|
| `/glm-refresh` | Force-refresh quota data immediately |
| `/glm-lang` | Switch between Chinese and English |
| `/glm-section` | Toggle panel border visibility |
| `/glm-config` | Show current configuration |

Language and border preferences are persisted (plugin KV) and survive restarts.

## Panel Layout

```
▼ GLM Quota v0.1.0         14:24
───────────────────────────────
Platform:                 ZHIPU
Plan:                       Pro
5h Token
[███████░░░░░░░░░░░░░░░░░░] 28%
Reset: 2h 30m (16:58)
Weekly quota
[██░░░░░░░░░░░░░░░░░░░░░░░░] 7%
Reset: 4d 1h (Thu 16:03)
MCP                     0/1,000
[░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%
```

Progress bar color rules:

| Usage | Color | Meaning |
|-------|-------|---------|
| < 70% | Green | Plenty remaining |
| 70-90% | Orange | Approaching limit |
| >= 90% | Red | Near exhaustion |

> Note: color logic is the inverse of cache-style plugins — higher usage = redder.

## Build

```bash
npm install          # install deps (peer deps are host-provided by OpenCode)
npm run build        # tsc output + esbuild bundle → dist/tui.js
npm run typecheck    # tsc --noEmit
```

Build artifacts:

- `dist/tui.js` — SolidJS-bundled TUI plugin (the actually-loaded plugin)
- `dist/server.js` — empty server-plugin shell for compatibility

## Architecture

| Aspect | Implementation |
|--------|----------------|
| Plugin type | TUI plugin (sidebar_content slot) |
| Rendering | SolidJS (@opentui/solid) |
| Data source | Z.AI / ZHIPU Monitor API (3 endpoints per platform) |
| Credentials | OpenCode auth.json / environment variables |
| HTTP client | `fetch()` + AbortController 10s timeout |
| Error strategy | `Promise.allSettled` graceful degradation (shows partial data) |
| Refresh strategy | first fetch on mount + poll every 5 minutes |

> The auth header uses `Authorization: <token>` with **no** `Bearer` prefix
> (required by the GLM Monitor API).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Panel blank / no data | Not authenticated, auth.json path not matched, or env vars unset |
| Partial data missing | An API endpoint timed out (10s); the rest still renders |
| Language toggle not working | Set `GLM_VISTATUS_LANG=zh\|en` to force a language (bypasses auto-detect) |
| Data not updating | Restart OpenCode, or run `/glm-refresh` to refresh now |

## License

MIT
