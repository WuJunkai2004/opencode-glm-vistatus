# opencode-glm-vistatus

[English](./README.en.md) | 简体中文

> OpenCode TUI 插件 — 在侧边栏实时显示 Z.AI / ZHIPU GLM Coding Plan 额度使用情况。

---

## 功能

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

## 安装

### 方式一：npm 安装（推荐）

```bash
npm install opencode-glm-vistatus
npx opencode-glm-vistatus
```

安装脚本会自动修改跨平台 OpenCode 配置目录下的 `tui.jsonc`，注册插件。

### 方式二：手动配置

在配置目录的 `tui.jsonc` 中添加：

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-glm-vistatus"]
}
```

| 系统 | 配置目录 |
|------|----------|
| Windows | `%APPDATA%\opencode\` |
| macOS / Linux | `~/.config/opencode/` |

重启 OpenCode 即可在侧边栏看到 GLM 额度面板。

## 前置条件

1. 通过 `/connect` 命令认证 Z.AI / ZHIPU 账户，或
2. 设置环境变量 `ZAI_API_KEY` / `ZHIPU_API_KEY`

凭证发现优先级：XDG `~/.local/share/opencode/auth.json` → Windows `%LOCALAPPDATA%\opencode\auth.json` → 环境变量。

## 斜杠命令

| 命令 | 功能 |
|------|------|
| `/glm-refresh` | 立即刷新额度数据 |
| `/glm-lang` | 切换中 / 英文显示 |
| `/glm-section` | 开关面板边框显隐 |
| `/glm-config` | 查看当前配置 |

语言与边框偏好会持久化保存（插件 KV），重启后保留。

## 面板布局

```
▼ GLM 额度 v0.1.0         14:24
───────────────────────────────
平台:                     ZHIPU
套餐:                       Pro
5h Token
[███████░░░░░░░░░░░░░░░░░░] 28%
重置: 2h 30m (16:58)
周配额
[██░░░░░░░░░░░░░░░░░░░░░░░░] 7%
重置: 4d 1h (Thu 16:03)
MCP                     0/1,000
[░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%
```

进度条颜色规则：

| 使用率 | 颜色 | 含义 |
|--------|------|------|
| < 70% | 绿 | 余量充足 |
| 70-90% | 橙 | 接近上限 |
| >= 90% | 红 | 即将耗尽 |

> 注：颜色逻辑与缓存类插件相反 —— 使用率越高越红。

## 构建

```bash
npm install          # 安装依赖（peer deps 由 OpenCode 宿主提供）
npm run build        # tsc 产物 + esbuild 打包 → dist/tui.js
npm run typecheck    # tsc --noEmit
```

构建产物：

- `dist/tui.js` — SolidJS 打包的 TUI 插件（实际加载的插件）
- `dist/server.js` — 兼容用的空 Server 插件壳

## 技术架构

| 维度 | 实现 |
|------|------|
| 插件类型 | TUI 插件（sidebar_content 插槽） |
| 渲染方式 | SolidJS (@opentui/solid) |
| 数据来源 | Z.AI / ZHIPU Monitor API（每平台 3 端点） |
| 凭证来源 | OpenCode auth.json / 环境变量 |
| HTTP 客户端 | `fetch()` + AbortController 10s 超时 |
| 错误策略 | `Promise.allSettled` 优雅降级（部分失败也展示） |
| 刷新策略 | 挂载首次获取 + 每 5 分钟轮询 |

> 认证头使用 `Authorization: <token>`，**不带** `Bearer` 前缀（GLM Monitor API 要求）。

## 故障排查

| 现象 | 可能原因 |
|------|----------|
| 面板显示空白 / 无数据 | 未认证，或 auth.json 路径未命中，或未设置环境变量 |
| 数据部分缺失 | 某个 API 端点超时（10s），其余仍会展示 |
| 语言切换无效 | 可设置环境变量 `GLM_VISTATUS_LANG=zh\|en` 强制语言（绕过自动检测） |
| 数据不更新 | 重启 OpenCode，或使用 `/glm-refresh` 立即刷新 |

## License

MIT
