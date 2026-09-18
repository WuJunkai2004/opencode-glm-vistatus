/**
 * V2 slash commands, registered through a reactive `keymap.layer`.
 *
 * V2 dialogs are promise-based (`context.ui.dialog.select/prompt`), unlike
 * V1's callback dialog stack in `src/v1/commands.tsx` — the flows are re-written
 * against that contract while keeping identical semantics (menu levels,
 * validation, toggle states and toasts).
 *
 * `keymap.layer` must be called from a component render context, so this
 * module only builds the command array; the V2 entry mounts it via a
 * component in the always-mounted `app` slot (see `src/v2/index.tsx`).
 */

import type { Context, KeymapCommand } from "./types";
import type { KvAdapter, PanelSignals } from "../ui/panel";
import {
  KV,
  MIN_REFRESH_INTERVAL_MIN,
  MAX_REFRESH_INTERVAL_MIN,
} from "../ui/panel";
import {
  getSettingsTranslations,
  getMcpTranslations,
  formatIntervalLabel,
} from "../ui/i18n";
import { isValidInterval } from "../utils/panel-signals";
import {
  applyMcpSelection,
  diffMcpSelection,
  type ToastPort,
} from "../utils/mcp-manage";
import { getInstalledGlmMcp, GLM_MCP_SERVER_NAMES, type Scope } from "../utils/mcp-servers";

export interface CommandHost {
  context: Context;
  kv: KvAdapter;
  signals: PanelSignals;
  /** Project directory used for `local`-scope MCP config edits. */
  projectDir: string;
}

// ---------------------------------------------------------------------------
// /glm-config — language / border / refresh interval
// ---------------------------------------------------------------------------

async function runSettingsMenu(host: CommandHost): Promise<void> {
  const { context, kv, signals } = host;
  const t = () => getSettingsTranslations(signals.langZH());

  for (;;) {
    const border = Boolean(kv.get(`${KV}.border`, true));
    const pick = await context.ui.dialog.select<string>({
      title: t().menuTitle,
      options: [
        {
          title: `${t().menuLang}  [${signals.langZH() ? "中文" : "English"}]`,
          value: "lang",
        },
        {
          title: `${t().menuBorder}  [${border ? t().on : t().off}]`,
          value: "border",
        },
        {
          title: t().menuInterval(
            formatIntervalLabel(signals.refreshIntervalMin()),
          ),
          value: "interval",
        },
        { title: t().menuDone, value: "__done" },
      ],
    });
    if (!pick || pick === "__done") return;

    if (pick === "lang") {
      const lang = await context.ui.dialog.select<string>({
        title: t().menuLang,
        options: [
          { title: `中文    ${signals.langZH() ? "\u2713" : ""}`, value: "zh" },
          {
            title: `English ${signals.langZH() ? "" : "\u2713"}`,
            value: "en",
          },
        ],
        current: signals.langZH() ? "zh" : "en",
      });
      if (lang === "zh" || lang === "en") {
        await kv.set(`${KV}.lang`, lang);
        signals.setLangZH(lang === "zh");
      }
    } else if (pick === "border") {
      const onOff = await context.ui.dialog.select<string>({
        title: t().menuBorder,
        options: [
          { title: `${t().on}  ${!border ? "\u2713" : ""}`, value: "on" },
          { title: `${t().off}  ${border ? "\u2713" : ""}`, value: "off" },
        ],
        current: border ? "on" : "off",
      });
      if (onOff === "on" || onOff === "off") {
        const on = onOff === "on";
        await kv.set(`${KV}.border`, on);
        signals.setBorderVisible(on);
      }
    } else if (pick === "interval") {
      const cur = signals.refreshIntervalMin();
      const choice = await context.ui.dialog.select<string>({
        title: t().intervalTitle,
        options: [
          ...t().intervalPresets.map((p) => ({
            title: `${p.label}${p.minutes === cur ? "  \u2713" : ""}`,
            value: String(p.minutes),
          })),
          { title: t().intervalCustom, value: "__custom" },
        ],
        current: String(cur),
      });
      if (!choice) continue;
      if (choice === "__custom") {
        const raw = await context.ui.dialog.prompt({
          title: t().intervalCustomTitle,
          placeholder: t().intervalCustomPlaceholder,
        });
        if (raw === undefined) continue;
        const n = Math.round(Number(raw));
        if (raw.trim() === "" || !isValidInterval(n)) {
          context.ui.toast.show({
            variant: "error",
            message: t().intervalInvalid(
              MIN_REFRESH_INTERVAL_MIN,
              MAX_REFRESH_INTERVAL_MIN,
            ),
          });
          continue;
        }
        await kv.set(`${KV}.interval`, n);
        signals.setRefreshIntervalMin(n);
        context.ui.toast.show({
          variant: "success",
          message: t().intervalSaved(t().minutes(n)),
        });
      } else {
        const n = Number(choice);
        await kv.set(`${KV}.interval`, n);
        signals.setRefreshIntervalMin(n);
        context.ui.toast.show({
          variant: "success",
          message: t().intervalSaved(t().minutes(n)),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// /glm-mcp-manage — install / uninstall GLM MCP servers
// ---------------------------------------------------------------------------

async function runMcpManage(host: CommandHost): Promise<void> {
  const { context, kv, signals, projectDir } = host;
  const t = () => getMcpTranslations(signals.langZH());

  // ── Step 1: scope ──
  const scope = await context.ui.dialog.select<Scope>({
    title: t().scopeTitle,
    options: [
      { title: t().local, description: t().localDesc, value: "local" },
      { title: t().global, description: t().globalDesc, value: "global" },
    ],
  });
  if (!scope) return;

  const scopeLabel = t().scopeLabel(scope);

  // ── Step 2: toggle loop (V2 has no multi-select; re-present after every
  // toggle with ✓/○ prefixes, mirroring V1's checkbox list) ──
  const initial = getInstalledGlmMcp(scope, projectDir);
  const selected = new Set<string>(initial);

  for (;;) {
    const allOn = selected.size === GLM_MCP_SERVER_NAMES.length;
    const { toInstall, toUninstall } = diffMcpSelection(initial, selected);

    const pick = await context.ui.dialog.select<string>({
      title: t().pickTitle(scopeLabel),
      placeholder: t().pickHint,
      options: [
        ...GLM_MCP_SERVER_NAMES.map((name) => ({
          title: `${selected.has(name) ? "\u2713" : "\u25cb"}  ${t().servers[name].label}`,
          description: t().servers[name].desc,
          value: name,
        })),
        {
          title: `${allOn ? "\u25cb" : "\u2713"}  ${allOn ? t().deselectAll : t().selectAll}`,
          value: "__bulk",
        },
        {
          title: t().confirm(toInstall.length, toUninstall.length, scopeLabel),
          value: "__confirm",
        },
      ],
    });
    if (!pick) return; // dismissed
    if (pick === "__confirm") break;
    if (pick === "__bulk") {
      selected.clear();
      if (!allOn) for (const n of GLM_MCP_SERVER_NAMES) selected.add(n);
      continue;
    }
    if (selected.has(pick)) selected.delete(pick);
    else selected.add(pick);
  }

  // ── Apply only the entries that differ from the entry state ──
  const toast: ToastPort = { toast: (o) => context.ui.toast.show(o) };
  applyMcpSelection({
    scope,
    projectDir,
    initial,
    selected,
    i18n: t(),
    toast,
  });
}

// ---------------------------------------------------------------------------
// Command array
// ---------------------------------------------------------------------------

export function makeCommands(host: CommandHost): KeymapCommand[] {
  const { context, signals } = host;
  return [
    {
      id: "opencode-glm-vistatus.glm.refresh",
      title: "GLM: Refresh Now",
      description: "Force refresh GLM quota data immediately",
      group: "GLM",
      palette: true,
      slash: { name: "glm-refresh" },
      run: async () => {
        signals.setForceRefresh(Date.now());
        context.ui.toast.show({
          message: signals.langZH()
            ? "正在刷新 GLM 额度..."
            : "Refreshing GLM quota...",
        });
      },
    },
    {
      id: "opencode-glm-vistatus.glm.config",
      title: "GLM: Settings",
      description:
        "Open plugin settings (language / border / refresh interval)",
      group: "GLM",
      palette: true,
      slash: { name: "glm-config" },
      run: async () => {
        await runSettingsMenu(host);
      },
    },
    {
      id: "opencode-glm-vistatus.glm.mcp",
      title: "GLM: Manage MCP Servers",
      description: "Install or uninstall GLM Coding Plan MCP servers",
      group: "GLM",
      palette: true,
      slash: { name: "glm-mcp-manage", aliases: ["glm-mcp-install"] },
      run: async () => {
        await runMcpManage(host);
      },
    },
  ];
}
