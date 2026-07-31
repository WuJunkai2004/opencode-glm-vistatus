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

// ---------------------------------------------------------------------------
// MCP installer translations
// ---------------------------------------------------------------------------

export type McpScope = "local" | "global";

export interface McpServerMeta {
  label: string;
  desc: string;
}

export interface McpI18n {
  scopeTitle: string;
  local: string;
  localDesc: string;
  global: string;
  globalDesc: string;
  pickTitle: string;
  pickHint: string;
  servers: Record<string, McpServerMeta>;
  selectAll: string;
  deselectAll: string;
  confirm: (n: number, scopeLabel: string) => string;
  noneSelected: string;
  okTitle: string;
  okMsg: (
    added: number,
    skipped: number,
    scopeLabel: string,
    file: string,
  ) => string;
  failTitle: string;
  noCred: string;
  scopeLabel: (scope: McpScope) => string;
}

const ZH_MCP: McpI18n = {
  scopeTitle: "GLM MCP 安装范围",
  local: "Local  ·  当前项目",
  localDesc: "写入项目根目录 opencode.json",
  global: "Global  ·  全局用户",
  globalDesc: "写入 ~/.config/opencode/opencode.json",
  pickTitle: "选择要安装的 GLM MCP 服务器",
  pickHint: "回车切换选中状态，选择完成后点击安装",
  servers: {
    "github-read": {
      label: "开源仓库 MCP",
      desc: "GitHub 仓库知识、代码结构与文件内容",
    },
    "glm-web-reader": {
      label: "网页读取 MCP",
      desc: "网页内容提取与结构化数据获取",
    },
    "glm-web-search": { label: "联网搜索 MCP", desc: "网络搜索与实时信息获取" },
    "glm-vision": {
      label: "视觉理解 MCP",
      desc: "图像分析、视频理解 (GLM-4.6V)",
    },
  },
  selectAll: "全选",
  deselectAll: "全不选",
  confirm: (n, scopeLabel) => `▸ 安装 ${n} 个选中  →  ${scopeLabel}`,
  noneSelected: "（请至少选择一个）",
  okTitle: "GLM MCP 安装完成",
  okMsg: (added, skipped, scopeLabel, file) =>
    `${added} 新增 · ${skipped} 已存在 → ${scopeLabel}  (${file})`,
  failTitle: "GLM MCP 安装失败",
  noCred: "未找到 GLM 凭证，请先运行 /connect 认证",
  scopeLabel: (scope) => (scope === "global" ? "全局" : "项目"),
};

const EN_MCP: McpI18n = {
  scopeTitle: "GLM MCP Install Scope",
  local: "Local  ·  current project",
  localDesc: "Write to project root opencode.json",
  global: "Global  ·  user-wide",
  globalDesc: "Write to ~/.config/opencode/opencode.json",
  pickTitle: "Select GLM MCP Servers to Install",
  pickHint: "Press Enter to toggle, then confirm to install",
  servers: {
    "github-read": {
      label: "Repo Knowledge",
      desc: "GitHub repo docs, code structure & file content",
    },
    "glm-web-reader": {
      label: "Web Reader",
      desc: "Web page content extraction & structured data",
    },
    "glm-web-search": {
      label: "Web Search",
      desc: "Web search & real-time information",
    },
    "glm-vision": {
      label: "Vision",
      desc: "Image analysis & video understanding (GLM-4.6V)",
    },
  },
  selectAll: "Select All",
  deselectAll: "Deselect All",
  confirm: (n, scopeLabel) => `▸ Install ${n} selected  →  ${scopeLabel}`,
  noneSelected: "(select at least one)",
  okTitle: "GLM MCP Installed",
  okMsg: (added, skipped, scopeLabel, file) =>
    `${added} added · ${skipped} existing → ${scopeLabel}  (${file})`,
  failTitle: "GLM MCP Install Failed",
  noCred: "No GLM credentials found. Run /connect to authenticate",
  scopeLabel: (scope) => scope,
};

export function getMcpTranslations(langZH: boolean): McpI18n {
  return langZH ? ZH_MCP : EN_MCP;
}
