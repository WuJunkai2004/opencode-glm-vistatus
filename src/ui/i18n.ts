/**
 * Bilingual translations (Chinese / English).
 * Source: opencode-visual-cache/src/index.tsx:86-148
 */

export interface Translations {
  title: string;
  token5h: string;
  weekly: string;
  mcp: string;
  resetsIn: string;
  tokenUsed: string;
  plan: string;
  platform: string;
  refreshing: string;
  noData: string;
  noCred: string;
  noCredHint: string;
  lastUpdate: string;
  nextRefresh: string;
  error: string;
  errorPrefix: string;
  collapse: string;
  collapsed: string;
}

const ZH_T: Translations = {
  title: "GLM 额度",
  token5h: "5h 限额",
  weekly: "周配额",
  mcp: "MCP",
  resetsIn: "重置",
  tokenUsed: "已用",
  plan: "套餐",
  platform: "平台",
  refreshing: "刷新中...",
  noData: "等待额度数据...",
  noCred: "未找到凭证",
  noCredHint: "请运行 /connect 认证",
  lastUpdate: "更新",
  nextRefresh: "下次",
  error: "获取失败",
  errorPrefix: "错误",
  collapse: "折叠",
  collapsed: "已用",
};

const EN_T: Translations = {
  title: "GLM Quota",
  token5h: "5h Token",
  weekly: "Weekly",
  mcp: "MCP",
  resetsIn: "Reset",
  tokenUsed: "Used",
  plan: "Plan",
  platform: "Platform",
  refreshing: "Refreshing...",
  noData: "Waiting for quota data...",
  noCred: "No credentials found",
  noCredHint: "Run /connect to authenticate",
  lastUpdate: "Updated",
  nextRefresh: "Next",
  error: "Fetch failed",
  errorPrefix: "Error",
  collapse: "Collapse",
  collapsed: "used",
};

export function getTranslations(langZH: boolean): Translations {
  return langZH ? ZH_T : EN_T;
}
