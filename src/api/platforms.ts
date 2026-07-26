/**
 * Platform detection — maps provider IDs to platforms.
 * Source: opencode-glm-quota/src/api/platforms.ts
 */

import type { Platform } from "./endpoints";

/**
 * Detect platform from provider ID.
 * @param providerId - The provider ID from OpenCode authentication
 * @returns Platform type or null if unknown
 */
export function detectPlatform(providerId: string): Platform | null {
  const lower = providerId.toLowerCase();

  if (lower.includes("zhipu") || lower.includes("bigmodel")) {
    return "ZHIPU";
  }

  if (lower.includes("zai") || lower === "z.ai" || lower === "z-ai") {
    return "ZAI";
  }

  return null;
}

/**
 * Get platform display name.
 * @param platform - The platform type
 * @returns Human-readable platform name
 */
export function getPlatformName(platform: Platform): string {
  switch (platform) {
    case "ZAI":
      return "Z.AI";
    case "ZHIPU":
      return "ZHIPU";
    default:
      return platform;
  }
}
