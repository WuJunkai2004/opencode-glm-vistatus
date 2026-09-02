/**
 * GLM MCP server definitions and config-file installer.
 *
 * Four GLM Coding Plan exclusive MCP servers (official docs):
 *   1. github-read     (Remote) — open-source repo knowledge / code reading
 *      https://docs.bigmodel.cn/cn/coding-plan/mcp/zread-mcp-server
 *   2. glm-web-reader  (Remote) — web page content extraction
 *      https://docs.bigmodel.cn/cn/coding-plan/mcp/reader-mcp-server
 *   3. glm-web-search  (Remote) — web search
 *      https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
 *   4. glm-vision      (Local)  — vision understanding (GLM-4.6V via npx)
 *      https://docs.bigmodel.cn/cn/coding-plan/mcp/vision-mcp-server
 *
 * Server names differ from upstream defaults (zread, web-reader, …) so the
 * resulting tool prefixes are self-descriptive, improving model tool-selection
 * hit-rate.  The remote URL paths are unaffected by the name change.
 *
 * Config format follows OpenCode's `mcp` schema:
 *   https://opencode.ai/docs/mcp-servers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Platform } from "../api/endpoints";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type McpRemoteEntry = {
  type: "remote";
  url: string;
  headers: Record<string, string>;
};

type McpLocalEntry = {
  type: "local";
  command: string[];
  environment: Record<string, string>;
};

type McpEntry = McpRemoteEntry | McpLocalEntry;

type RawConfig = {
  $schema?: string;
  mcp?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Scope = "local" | "global";

export interface InstallResult {
  ok: boolean;
  filePath: string;
  scope: Scope;
  added: string[];
  skipped: string[];
  error?: string;
}

export interface UninstallResult {
  ok: boolean;
  filePath: string;
  scope: Scope;
  removed: string[];
  missing: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Server definitions
// ---------------------------------------------------------------------------

const REMOTE_BASE = "https://open.bigmodel.cn/api/mcp";

const REMOTE_SERVERS = [
  { name: "github-read", urlPath: "zread/mcp" },
  { name: "glm-web-reader", urlPath: "web_reader/mcp" },
  { name: "glm-web-search", urlPath: "web_search_prime/mcp" },
] as const;

const VISION_SERVER_NAME = "glm-vision";

export const GLM_MCP_SERVER_NAMES = [
  ...REMOTE_SERVERS.map((s) => s.name),
  VISION_SERVER_NAME,
] as readonly string[];

/**
 * Build MCP config entries for the four GLM servers.
 *
 * Remote servers use `"Authorization": "Bearer <token>"` (standard MCP auth).
 * The local vision server (`glm-vision`) uses the raw key in `Z_AI_API_KEY`
 * env var and `@z_ai/mcp-server@latest` to avoid stale npx cache.
 *
 * @param token    Raw API key (no prefix)
 * @param platform Detected platform (ZAI / ZHIPU)
 * @param filter   Optional subset of server names; omit for all four
 */
export function buildGlmMcpEntries(
  token: string,
  platform: Platform,
  filter?: ReadonlySet<string>,
): Record<string, McpEntry> {
  const entries: Record<string, McpEntry> = {};

  for (const srv of REMOTE_SERVERS) {
    if (filter && !filter.has(srv.name)) continue;
    entries[srv.name] = {
      type: "remote",
      url: `${REMOTE_BASE}/${srv.urlPath}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  if (!filter || filter.has(VISION_SERVER_NAME)) {
    entries[VISION_SERVER_NAME] = {
      type: "local",
      command: ["npx", "-y", "@z_ai/mcp-server@latest"],
      environment: {
        Z_AI_API_KEY: token,
        Z_AI_MODE: platform,
      },
    };
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Config-file path resolution
// ---------------------------------------------------------------------------

function globalConfigDir(): string {
  return path.join(os.homedir(), ".config", "opencode");
}

const CONFIG_FILENAMES = ["opencode.json", "opencode.jsonc"] as const;

/**
 * Resolve the config file path for the given scope.
 *
 * - `global`: searches `~/.config/opencode/` (or `%APPDATA%/opencode/` on Windows)
 * - `local`:  searches the project root directory
 *
 * If no existing file is found, defaults to `opencode.json`.
 */
function resolveConfigFile(scope: Scope, projectDir: string): string {
  const dir = scope === "global" ? globalConfigDir() : projectDir;

  for (const name of CONFIG_FILENAMES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }

  return path.join(dir, "opencode.json");
}

// ---------------------------------------------------------------------------
// JSONC helpers (same heuristic as install.mjs)
// ---------------------------------------------------------------------------

function readJSONC(p: string): RawConfig {
  const raw = fs.readFileSync(p, "utf-8");
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped) as RawConfig;
}

function writeJSON(p: string, obj: RawConfig): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Installer
// ---------------------------------------------------------------------------

/**
 * Install GLM MCP servers into an OpenCode config file.
 *
 * Reads the target config (creating if absent), merges the selected MCP
 * entries (overwriting existing same-named servers), and writes back.
 *
 * @param token      Raw API key
 * @param platform   Detected platform (ZAI / ZHIPU)
 * @param scope      "local" (project) or "global" (user-wide)
 * @param projectDir Working directory for local scope
 * @param servers    Optional subset of server names; omit for all four
 * @returns          Install result with added/skipped server names
 */
export function installGlmMcp(
  token: string,
  platform: Platform,
  scope: Scope,
  projectDir: string,
  servers?: ReadonlySet<string>,
): InstallResult {
  const filePath = resolveConfigFile(scope, projectDir);

  let config: RawConfig;
  try {
    config = fs.existsSync(filePath) ? readJSONC(filePath) : {};
  } catch {
    config = {};
  }

  if (!config.$schema) {
    config.$schema = "https://opencode.ai/config.json";
  }

  if (!config.mcp || typeof config.mcp !== "object") {
    config.mcp = {};
  }

  const entries = buildGlmMcpEntries(token, platform, servers);
  const added: string[] = [];
  const skipped: string[] = [];

  for (const [name, entry] of Object.entries(entries)) {
    if (JSON.stringify(config.mcp![name]) === JSON.stringify(entry)) {
      skipped.push(name);
    } else {
      config.mcp![name] = entry;
      added.push(name);
    }
  }

  try {
    writeJSON(filePath, config);
  } catch (e) {
    return {
      ok: false,
      filePath,
      scope,
      added: [],
      skipped: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { ok: true, filePath, scope, added, skipped };
}

/**
 * Uninstall GLM MCP servers from an OpenCode config file.
 *
 * Reads the target config, deletes the selected GLM MCP entries, and writes
 * back. The config file is only touched if at least one entry exists (or the
 * file itself is absent), so uninstalling from a clean setup never creates
 * stray files.
 *
 * @param scope      "local" (project) or "global" (user-wide)
 * @param projectDir Working directory for local scope
 * @param servers    Optional subset of server names; omit for all four
 * @returns          Uninstall result with removed/missing server names
 */
export function uninstallGlmMcp(
  scope: Scope,
  projectDir: string,
  servers?: ReadonlySet<string>,
): UninstallResult {
  const filePath = resolveConfigFile(scope, projectDir);

  if (!fs.existsSync(filePath)) {
    return {
      ok: true,
      filePath,
      scope,
      removed: [],
      missing: [...GLM_MCP_SERVER_NAMES],
    };
  }

  let config: RawConfig;
  try {
    config = readJSONC(filePath);
  } catch (e) {
    return {
      ok: false,
      filePath,
      scope,
      removed: [],
      missing: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const targets = servers ?? new Set<string>(GLM_MCP_SERVER_NAMES);
  const removed: string[] = [];
  const missing: string[] = [];

  for (const name of GLM_MCP_SERVER_NAMES) {
    if (!targets.has(name)) continue;
    if (config.mcp && name in config.mcp) {
      delete config.mcp[name];
      removed.push(name);
    } else {
      missing.push(name);
    }
  }

  if (removed.length === 0) {
    return { ok: true, filePath, scope, removed, missing };
  }

  // Drop an empty `mcp` object so we don't leave `"mcp": {}` behind.
  if (
    config.mcp &&
    typeof config.mcp === "object" &&
    Object.keys(config.mcp).length === 0
  ) {
    delete config.mcp;
  }

  try {
    writeJSON(filePath, config);
  } catch (e) {
    return {
      ok: false,
      filePath,
      scope,
      removed: [],
      missing: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { ok: true, filePath, scope, removed, missing };
}
