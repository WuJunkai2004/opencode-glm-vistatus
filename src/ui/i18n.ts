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
  actionTitle: string;
  actionInstall: string;
  actionInstallDesc: string;
  actionUninstall: string;
  actionUninstallDesc: string;
  scopeTitle: (mode: "install" | "uninstall") => string;
  local: string;
  localDesc: string;
  global: string;
  globalDesc: string;
  pickTitle: (mode: "install" | "uninstall") => string;
  pickHint: string;
  servers: Record<string, McpServerMeta>;
  selectAll: string;
  deselectAll: string;
  confirm: (
    mode: "install" | "uninstall",
    n: number,
    scopeLabel: string,
  ) => string;
  noneSelected: string;
  okTitle: (mode: "install" | "uninstall") => string;
  okMsg: (
    mode: "install" | "uninstall",
    changed: number,
    unchanged: number,
    scopeLabel: string,
    file: string,
  ) => string;
  failTitle: (mode: "install" | "uninstall") => string;
  noCred: string;
  scopeLabel: (scope: McpScope) => string;
}

const ZH_MCP: McpI18n = {
  actionTitle: "GLM MCP 管理",
  actionInstall: "安装  ·  添加/更新 MCP 服务器",
  actionInstallDesc: "将选中的 GLM MCP 服务器写入配置",
  actionUninstall: "卸载  ·  移除已安装的 MCP 服务器",
  actionUninstallDesc: "将选中的 GLM MCP 服务器从配置中删除",
  scopeTitle: (mode) =>
    mode === "uninstall" ? "GLM MCP 卸载范围" : "GLM MCP 安装范围",
  local: "Local  ·  当前项目",
  localDesc: "写入项目根目录 opencode.json",
  global: "Global  ·  全局用户",
  globalDesc: "写入 ~/.config/opencode/opencode.json",
  pickTitle: (mode) =>
    mode === "uninstall"
      ? "选择要卸载的 GLM MCP 服务器"
      : "选择要安装的 GLM MCP 服务器",
  pickHint: "回车切换选中状态，选择完成后点击确认",
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
  confirm: (mode, n, scopeLabel) =>
    mode === "uninstall"
      ? `▸ 卸载 ${n} 个选中  →  ${scopeLabel}`
      : `▸ 安装 ${n} 个选中  →  ${scopeLabel}`,
  noneSelected: "（请至少选择一个）",
  okTitle: (mode) =>
    mode === "uninstall" ? "GLM MCP 卸载完成" : "GLM MCP 安装完成",
  okMsg: (mode, changed, unchanged, scopeLabel, file) =>
    mode === "uninstall"
      ? `${changed} 已移除 · ${unchanged} 未安装 → ${scopeLabel}  (${file})`
      : `${changed} 新增 · ${unchanged} 已存在 → ${scopeLabel}  (${file})`,
  failTitle: (mode) =>
    mode === "uninstall" ? "GLM MCP 卸载失败" : "GLM MCP 安装失败",
  noCred: "未找到 GLM 凭证，请先运行 /connect 认证",
  scopeLabel: (scope) => (scope === "global" ? "全局" : "项目"),
};

const EN_MCP: McpI18n = {
  actionTitle: "GLM MCP Manage",
  actionInstall: "Install  ·  add / update MCP servers",
  actionInstallDesc: "Write selected GLM MCP servers into config",
  actionUninstall: "Uninstall  ·  remove installed MCP servers",
  actionUninstallDesc: "Delete selected GLM MCP servers from config",
  scopeTitle: (mode) =>
    mode === "uninstall" ? "GLM MCP Uninstall Scope" : "GLM MCP Install Scope",
  local: "Local  ·  current project",
  localDesc: "Write to project root opencode.json",
  global: "Global  ·  user-wide",
  globalDesc: "Write to ~/.config/opencode/opencode.json",
  pickTitle: (mode) =>
    mode === "uninstall"
      ? "Select GLM MCP Servers to Uninstall"
      : "Select GLM MCP Servers to Install",
  pickHint: "Press Enter to toggle, then confirm",
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
  confirm: (mode, n, scopeLabel) =>
    mode === "uninstall"
      ? `▸ Uninstall ${n} selected  →  ${scopeLabel}`
      : `▸ Install ${n} selected  →  ${scopeLabel}`,
  noneSelected: "(select at least one)",
  okTitle: (mode) =>
    mode === "uninstall" ? "GLM MCP Uninstalled" : "GLM MCP Installed",
  okMsg: (mode, changed, unchanged, scopeLabel, file) =>
    mode === "uninstall"
      ? `${changed} removed · ${unchanged} not found → ${scopeLabel}  (${file})`
      : `${changed} added · ${unchanged} existing → ${scopeLabel}  (${file})`,
  failTitle: (mode) =>
    mode === "uninstall"
      ? "GLM MCP Uninstall Failed"
      : "GLM MCP Install Failed",
  noCred: "No GLM credentials found. Run /connect to authenticate",
  scopeLabel: (scope) => scope,
};

export function getMcpTranslations(langZH: boolean): McpI18n {
  return langZH ? ZH_MCP : EN_MCP;
}
