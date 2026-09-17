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

/** Config files OpenCode accepts, in load order (`opencode.jsonc` wins). */
const CONFIG_FILENAMES = ["opencode.json", "opencode.jsonc"] as const;

/** Absolute paths of the config files that currently exist for the scope. */
function existingConfigFiles(scope: Scope, projectDir: string): string[] {
  const dir = scope === "global" ? globalConfigDir() : projectDir;
  return CONFIG_FILENAMES.map((name) => path.join(dir, name)).filter((p) =>
    fs.existsSync(p),
  );
}

/**
 * Resolve the config file a write should target.
 *
 * A directory may hold both `opencode.json` and `opencode.jsonc`, and OpenCode
 * merges them (`opencode.jsonc` wins). Whenever one of them already carries the
 * `mcp` field, that file is the target — preferring `opencode.jsonc` when both
 * do. Otherwise the first existing file is used, defaulting to `opencode.json`.
 */
function resolveConfigFile(scope: Scope, projectDir: string): string {
  const existing = existingConfigFiles(scope, projectDir);

  for (const p of [...existing].reverse()) {
    if (hasMcpField(p)) return p;
  }

  if (existing[0]) return existing[0];

  const dir = scope === "global" ? globalConfigDir() : projectDir;
  return path.join(dir, "opencode.json");
}

// ---------------------------------------------------------------------------
// JSONC helpers (same heuristic as install.mjs)
// ---------------------------------------------------------------------------

/**
 * Strip `//` and block comments from JSONC text without touching string
 * literals (so URLs such as `https://…` survive).
 */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
    } else if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
    } else {
      out += ch;
    }
  }

  return out;
}

/** Drop trailing commas (`[1,2,]` / `{"a":1,}`) outside string literals. */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Parse a config file that may be strict JSON, JSONC (comments) or JSON5-ish
 * (trailing commas) — OpenCode accepts all of them.
 */
function readJSONC(p: string): RawConfig {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(stripTrailingCommas(stripJsonComments(raw))) as RawConfig;
}

function writeJSON(p: string, obj: RawConfig): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function readConfigSafe(p: string): RawConfig | undefined {
  try {
    return readJSONC(p);
  } catch {
    return undefined;
  }
}

function hasMcpField(p: string): boolean {
  const config = readConfigSafe(p);
  return Boolean(config?.mcp) && typeof config?.mcp === "object";
}

// ---------------------------------------------------------------------------
// Installed-state inspection
// ---------------------------------------------------------------------------

/**
 * Read which GLM MCP servers are currently configured for the given scope.
 *
 * `opencode.json` and `opencode.jsonc` are both legal; OpenCode merges them,
 * so a server counts as installed when either file's `mcp` field declares it.
 * Missing, unreadable or malformed files simply contribute nothing, so the
 * picker always renders a valid initial state.
 *
 * @param scope      "local" (project) or "global" (user-wide)
 * @param projectDir Working directory for local scope
 * @returns          Names of GLM MCP servers present in the config
 */
export function getInstalledGlmMcp(
  scope: Scope,
  projectDir: string,
): Set<string> {
  const installed = new Set<string>();

  for (const file of existingConfigFiles(scope, projectDir)) {
    const config = readConfigSafe(file);
    if (!config?.mcp || typeof config.mcp !== "object") continue;
    for (const name of GLM_MCP_SERVER_NAMES) {
      if (name in config.mcp) installed.add(name);
    }
  }

  return installed;
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
 * Uninstall GLM MCP servers from the OpenCode config files of a scope.
 *
 * A server may be declared in `opencode.json`, `opencode.jsonc`, or both, so
 * every file that declares a selected server is edited. Files are only touched
 * if at least one entry exists, so uninstalling from a clean setup never
 * creates stray files.
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
  const files = existingConfigFiles(scope, projectDir);
  const targets = servers ?? new Set<string>(GLM_MCP_SERVER_NAMES);

  if (files.length === 0) {
    return {
      ok: true,
      filePath: resolveConfigFile(scope, projectDir),
      scope,
      removed: [],
      missing: GLM_MCP_SERVER_NAMES.filter((name) => targets.has(name)),
    };
  }

  const configs = new Map<string, RawConfig>();
  for (const file of files) {
    const config = readConfigSafe(file);
    if (config) configs.set(file, config);
  }

  const modified = new Set<string>();
  const removed: string[] = [];
  const missing: string[] = [];

  for (const name of GLM_MCP_SERVER_NAMES) {
    if (!targets.has(name)) continue;

    const holders = [...configs].filter(
      ([, config]) =>
        config.mcp && typeof config.mcp === "object" && name in config.mcp,
    );

    if (holders.length === 0) {
      missing.push(name);
      continue;
    }

    for (const [file, config] of holders) {
      delete config.mcp![name];
      modified.add(file);
    }
    removed.push(name);
  }

  if (modified.size === 0) {
    return {
      ok: true,
      filePath: files.join(", "),
      scope,
      removed,
      missing,
    };
  }

  try {
    for (const file of modified) {
      const config = configs.get(file)!;
      // Drop an empty `mcp` object so we don't leave `"mcp": {}` behind.
      if (
        config.mcp &&
        typeof config.mcp === "object" &&
        Object.keys(config.mcp).length === 0
      ) {
        delete config.mcp;
      }
      writeJSON(file, config);
    }
  } catch (e) {
    return {
      ok: false,
      filePath: [...modified].join(", "),
      scope,
      removed: [],
      missing: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return {
    ok: true,
    filePath: [...modified].join(", "),
    scope,
    removed,
    missing,
  };
}
