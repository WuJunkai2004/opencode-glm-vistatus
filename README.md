# opencode-glm-vistatus

> OpenCode TUI 插件 — 在侧边栏实时显示 Z.ai / ZHIPU GLM Coding Plan 额度使用情况。

OpenCode TUI plugin — real-time GLM Coding Plan quota usage in the sidebar.

---

## 功能 / Features

- 5 小时 Token 配额（百分比 + 进度条）
- 周 Token 配额（百分比 + 进度条）
- MCP 工具用量（百分比 + 进度条）
- Token 已用 / 总量
- 重置倒计时 + 本地时钟
- 账户套餐等级（Pro / Lite 等）
- 平台信息（Z.AI / ZHIPU）
- 最后刷新时间 + 下次刷新预估
- 每 5 分钟自动刷新
- 中 / 英文双语切换
- Morandi 风格主题适配
- 进度条颜色随使用率变化（绿 → 橙 → 红）

## 安装 / Installation

### 方式一：npm 安装

```bash
npm install opencode-glm-vistatus
npx opencode-glm-vistatus
```

安装脚本会自动修改 `~/.config/opencode/tui.jsonc`，注册插件。

### 方式二：手动配置

在 `~/.config/opencode/tui.jsonc` 中添加：

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-glm-vistatus@latest"]
}
```

重启 OpenCode 即可在侧边栏看到 GLM 额度面板。

## 前置条件 / Prerequisites

1. 通过 `/connect` 命令认证 Z.AI / ZHIPU 账户
2. 或设置环境变量 `ZAI_API_KEY` / `ZHIPU_API_KEY`

## 斜杠命令 / Slash Commands

| 命令 | 功能 |
|------|------|
| `/glm-refresh` | 立即刷新额度数据 |
| `/glm-lang` | 切换中 / 英文显示 |
| `/glm-section` | 开关区块显隐（明细 / 边框） |
| `/glm-config` | 查看当前配置 |

## 面板布局 / Panel Layout

```
┌─────────────────────────────────────────┐
│ ▼ GLM 额度 — Pro              v0.1.0   │
│ ─────────────────────────────────────── │
│ 平台: Z.AI                              │
│                                         │
│ 5h Token  [██████░░░░░░░] 45.2%        │
│   重置: 2h 48m (17:34)                 │
│                                         │
│ 周配额    [████████░░░░░] 62.0%        │
│   重置: 3d 12h (Sat 13:48)            │
│                                         │
│ MCP       [██░░░░░░░░░░] 15.3%        │
│ ─────────────────────────────────────── │
│ ▼ 已用                                   │
│   已用: 18.1M / 40M                    │
│   MCP:  153 / 1000                     │
│   套餐: Pro                             │
│ ─────────────────────────────────────── │
│ ↻ 14:32:05 · 下次 14:37               │
└─────────────────────────────────────────┘
```

进度条颜色规则：

| 使用率 | 颜色 | 含义 |
|--------|------|------|
| < 70% | 绿 | 余量充足 |
| 70-90% | 橙 | 接近上限 |
| >= 90% | 红 | 即将耗尽 |

## 构建 / Build

```bash
npm install
npm run build
```

构建产物：
- `dist/tui.js` — SolidJS 打包的 TUI 插件
- `dist/server.js` — 空的 Server 插件壳

## 技术架构 / Architecture

| 维度 | 实现 |
|------|------|
| 插件类型 | TUI 插件（sidebar_content 插槽） |
| 渲染方式 | SolidJS (@opentui/solid) |
| 数据来源 | Z.ai / ZHIPU Monitor API（3 端点） |
| 凭证来源 | OpenCode auth.json / 环境变量 |
| HTTP 客户端 | `fetch()` + AbortController 超时 |
| 刷新策略 | 挂载首次获取 + 每 5 分钟轮询 |
| 错误策略 | graceful degradation（部分数据也展示） |

## License

MIT
