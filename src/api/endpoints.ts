/**
 * API endpoints for ZAI and ZHIPU platforms.
 * Source: opencode-glm-quota/src/api/endpoints.ts
 */

export type Platform = "ZAI" | "ZHIPU"

interface PlatformEndpoints {
  readonly base: string
  readonly quotaLimit: string
  readonly modelUsage: string
  readonly toolUsage: string
}

const ENDPOINTS: Record<Platform, PlatformEndpoints> = {
  ZAI: {
    base: "https://api.z.ai",
    quotaLimit: "https://api.z.ai/api/monitor/usage/quota/limit",
    modelUsage: "https://api.z.ai/api/monitor/usage/model-usage",
    toolUsage: "https://api.z.ai/api/monitor/usage/tool-usage",
  },
  ZHIPU: {
    base: "https://open.bigmodel.cn",
    quotaLimit: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    modelUsage: "https://open.bigmodel.cn/api/monitor/usage/model-usage",
    toolUsage: "https://open.bigmodel.cn/api/monitor/usage/tool-usage",
  },
}

export function getEndpoints(platform: Platform): PlatformEndpoints {
  return ENDPOINTS[platform] ?? ENDPOINTS.ZAI
}
