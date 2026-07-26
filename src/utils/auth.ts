/**
 * Credential discovery — reads OpenCode auth.json + env vars.
 * Source: opencode-glm-quota/src/utils/auth-path.ts + src/index.ts:92-147
 *
 * Priority order:
 * 1. ~/.local/share/opencode/auth.json (XDG path, cross-platform, preferred)
 * 2. %LOCALAPPDATA%/opencode/auth.json (Windows legacy fallback)
 * 3. Environment variables ZAI_API_KEY / ZHIPU_API_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
 * Get credentials from OpenCode auth.json or environment variables.
 * @returns Credentials or null if not found
 */
export function getCredentials(): Credentials | null {
  // Priority 1: OpenCode auth.json — probe every candidate path
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

  // Priority 2: Environment variables (development/testing)
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
