/**
 * Credential discovery — reads OpenCode's V2 credential DB, V1 auth.json + env vars.
 * Source: opencode-glm-quota/src/utils/auth-path.ts + src/index.ts:92-147
 *
 * Priority order:
 * 1. V2 SQLite credential DB (~/.local/share/opencode/opencode.db) — V2 imports
 *    auth.json into it once and never writes that file back, so on V2 the DB is
 *    the only source that stays current
 * 2. ~/.local/share/opencode/auth.json (XDG path, cross-platform, V1 preferred)
 * 3. %LOCALAPPDATA%/opencode/auth.json (Windows legacy fallback)
 * 4. Environment variables ZAI_API_KEY / ZHIPU_API_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";
import type { Platform } from "../api/endpoints";
import { detectPlatform } from "../api/platforms";

const CANDIDATE_PROVIDER_IDS = [
  "zhipuai-coding-plan",
  "zai-coding-plan",
  "zai",
  "z-ai",
  "z.ai",
  "zhipu",
  "zhipuai",
] as const;

export interface Credentials {
  token: string;
  platform: Platform;
}

/**
 * Get ordered candidate paths for OpenCode's auth.json.
 * On win32: XDG path first, then legacy LOCALAPPDATA path.
 */
function getAuthFilePathCandidates(): string[] {
  const homedir = os.homedir();
  const xdgPath = path.join(
    homedir,
    ".local",
    "share",
    "opencode",
    "auth.json",
  );

  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
    const legacyPath = path.join(localAppData, "opencode", "auth.json");
    return [xdgPath, legacyPath];
  }

  return [xdgPath];
}

/** Minimal structural types for node:sqlite (built-in since Node 22.5 / Bun 1.1.9). */
interface SqliteStatement {
  all(): unknown[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (
    dbPath: string,
    options?: { readOnly?: boolean },
  ) => SqliteDatabase;
}

/**
 * Resolve node:sqlite lazily so hosts whose runtime lacks it — or that load
 * this bundle from a virtual URL where require() cannot resolve — fall through
 * to the next discovery step instead of failing the whole panel.
 */
function loadSqliteSync(): SqliteModule | null {
  try {
    const getBuiltinModule = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule;
    const mod = getBuiltinModule?.("node:sqlite") as SqliteModule | undefined;
    if (mod) return mod;
  } catch {
    // fall through to require()
  }
  try {
    return createRequire(import.meta.url)("node:sqlite") as SqliteModule;
  } catch {
    return null;
  }
}

/**
 * Get ordered candidate paths for OpenCode's V2 SQLite credential DB.
 * Mirrors the host's data-dir resolution: OPENCODE_DB > XDG_DATA_HOME > default.
 */
function getDbFilePathCandidates(): string[] {
  if (process.env.OPENCODE_DB) {
    return [process.env.OPENCODE_DB];
  }
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return [path.join(dataHome, "opencode", "opencode.db")];
}

/**
 * Read credentials from the V2 SQLite DB (`credential` table).
 * Each row's `value` is JSON, e.g. {"type":"key","key":"..."}; `active = 1`
 * marks the account the host currently uses. Read-only open + WAL mode make
 * this safe while the OpenCode server holds the database.
 */
function getCredentialsFromDb(): Credentials | null {
  const sqlite = loadSqliteSync();
  if (!sqlite) return null;

  for (const dbPath of getDbFilePathCandidates()) {
    if (!fs.existsSync(dbPath)) continue;

    let db: SqliteDatabase | undefined;
    try {
      db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      const rows = db
        .prepare(
          "SELECT integration_id, value, time_updated FROM credential WHERE active = 1",
        )
        .all() as Array<{
        integration_id: string;
        value: string;
        time_updated: number;
      }>;

      // Same provider-priority walk as the auth.json path; when an
      // integration has several active accounts, take the newest.
      for (const providerId of CANDIDATE_PROVIDER_IDS) {
        let newest: (typeof rows)[number] | undefined;
        for (const row of rows) {
          if (row.integration_id !== providerId) continue;
          if (!newest || row.time_updated > newest.time_updated) {
            newest = row;
          }
        }
        if (!newest) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(newest.value);
        } catch {
          continue;
        }
        const token = extractKeyFromEntry(parsed);
        if (token) {
          const platform = detectPlatform(providerId);
          if (platform) {
            return { token, platform };
          }
        }
      }
    } catch {
      // Silent fail, try next candidate
    } finally {
      try {
        db?.close();
      } catch {
        // already closed / never opened
      }
    }
  }

  return null;
}

/**
 * Extract API key from auth entry (supports string or object formats).
 */
function extractKeyFromEntry(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && entry !== null) {
    const obj = entry as Record<string, unknown>;
    for (const keyName of [
      "apiKey",
      "api_key",
      "token",
      "key",
      "accessToken",
      "auth_token",
    ]) {
      if (typeof obj[keyName] === "string") return obj[keyName] as string;
    }
  }
  return null;
}

/**
 * Get credentials from OpenCode's V2 credential DB, V1 auth.json or
 * environment variables.
 * @returns Credentials or null if not found
 */
export function getCredentials(): Credentials | null {
  // Priority 1: OpenCode V2 SQLite credential DB
  const dbCreds = getCredentialsFromDb();
  if (dbCreds) return dbCreds;

  // Priority 2: OpenCode V1 auth.json — probe every candidate path
  for (const authPath of getAuthFilePathCandidates()) {
    if (!fs.existsSync(authPath)) continue;
    try {
      const content = fs.readFileSync(authPath, "utf-8");
      const authData = JSON.parse(content) as Record<string, unknown>;

      for (const providerId of CANDIDATE_PROVIDER_IDS) {
        const entry = authData[providerId];
        if (entry) {
          const token = extractKeyFromEntry(entry);
          if (token) {
            const platform = detectPlatform(providerId);
            if (platform) {
              return { token, platform };
            }
          }
        }
      }
    } catch {
      // Silent fail, try next candidate
    }
  }

  // Priority 3: Environment variables (development/testing)
  if (process.env.ZAI_API_KEY) {
    return { token: process.env.ZAI_API_KEY, platform: "ZAI" };
  }

  if (process.env.ZHIPU_API_KEY || process.env.ZHIPUAI_API_KEY) {
    return {
      token: (process.env.ZHIPU_API_KEY || process.env.ZHIPUAI_API_KEY)!,
      platform: "ZHIPU",
    };
  }

  return null;
}
