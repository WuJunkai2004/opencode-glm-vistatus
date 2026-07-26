/**
 * HTTP client — fetch-based (adapted from glm-quota's node:https client).
 * Uses Promise.allSettled for graceful degradation (partial data shown).
 *
 * Differences from glm-quota:
 * - node:https → fetch() with AbortController timeout
 * - Promise.all + catch → Promise.allSettled (each endpoint independent)
 * - Error handling returns null instead of throwing (TUI keeps showing data)
 */

import type { Platform } from "./endpoints"
import { getEndpoints } from "./endpoints"
import { getTimeWindowQueryParams } from "../utils/time-window"

const REQUEST_TIMEOUT_MS = 10000

export interface QuotaResult {
  quotaData: Record<string, unknown> | null
  modelData: Record<string, unknown> | null
  toolData: Record<string, unknown> | null
}

/**
 * Make a single fetch request with timeout.
 * Returns parsed JSON or null on any failure.
 */
async function fetchJson(
  url: string,
  token: string,
  queryParams?: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const fullUrl = queryParams ? `${url}?${queryParams}` : url
    const res = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization: token, // NO "Bearer" prefix (CRITICAL)
        "Accept-Language": "en-US,en",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      return null
    }

    const json = await res.json()
    return json as Record<string, unknown>
  } catch {
    // Network timeout, parse error, etc. — return null for graceful degradation
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch all quota data from the three monitoring endpoints.
 * Uses Promise.allSettled so partial failures don't lose all data.
 */
export async function fetchAllQuota(token: string, platform: Platform): Promise<QuotaResult> {
  const endpoints = getEndpoints(platform)
  const queryParams = getTimeWindowQueryParams()

  const [quotaRes, modelRes, toolRes] = await Promise.allSettled([
    fetchJson(endpoints.quotaLimit, token),
    fetchJson(endpoints.modelUsage, token, queryParams),
    fetchJson(endpoints.toolUsage, token, queryParams),
  ])

  const quotaData = quotaRes.status === "fulfilled" ? quotaRes.value : null
  const modelData = modelRes.status === "fulfilled" ? modelRes.value : null
  const toolData = toolRes.status === "fulfilled" ? toolRes.value : null

  return { quotaData, modelData, toolData }
}
