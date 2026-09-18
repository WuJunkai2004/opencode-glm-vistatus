/** @jsxImportSource @opentui/solid */

/**
 * V1 slash commands (legacy `api.command` API): `/glm-refresh`,
 * `/glm-config` and `/glm-mcp-manage`, driven by the V1 callback dialog
 * stack (`api.ui.DialogSelect` / `DialogPrompt`).
 *
 * Business logic — interval validation, MCP diff/apply — lives in
 * `src/utils/` and is shared with the V2 entry (`src/v2/commands.ts`);
 * only the dialog mechanics are V1-specific here.
 */

import type {
  TuiCommand,
  TuiDialogStack,
  TuiPluginApi,
} from "@opencode-ai/plugin/tui";
import {
  KV,
  MIN_REFRESH_INTERVAL_MIN,
  MAX_REFRESH_INTERVAL_MIN,
  type PanelSignals,
} from "../ui/panel";
import {
  getMcpTranslations,
  getSettingsTranslations,
  formatIntervalLabel,
} from "../ui/i18n";
import { isValidInterval } from "../utils/panel-signals";
import { applyMcpSelection, diffMcpSelection } from "../utils/mcp-manage";
import {
  getInstalledGlmMcp,
  GLM_MCP_SERVER_NAMES,
  type Scope,
} from "../utils/mcp-servers";

export function buildV1Commands(
  api: TuiPluginApi,
  signals: PanelSignals,
): TuiCommand[] {
  return [
    {
      title: "GLM: Refresh Now",
      value: "glm.refresh",
      description: "Force refresh GLM quota data immediately",
      slash: { name: "glm-refresh" },
      onSelect: (dialog?: TuiDialogStack) => {
        signals.setForceRefresh(Date.now());
        api.ui.toast({
          message: signals.langZH()
            ? "正在刷新 GLM 额度..."
            : "Refreshing GLM quota...",
        });
        dialog?.clear();
      },
    },
    {
      title: "GLM: Settings",
      value: "glm.config",
      description:
        "Open plugin settings (language / border / refresh interval)",
      slash: { name: "glm-config" },
      onSelect: (dialog?: TuiDialogStack) => {
        function showMenu() {
          const si18n = getSettingsTranslations(signals.langZH());
          const border = Boolean(api.kv.get(`${KV}.border`, true));
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={si18n.menuTitle}
              options={[
                {
                  title: `${si18n.menuLang}  [${signals.langZH() ? "中文" : "English"}]`,
                  value: "lang",
                },
                {
                  title: `${si18n.menuBorder}  [${border ? si18n.on : si18n.off}]`,
                  value: "border",
                },
                {
                  title: si18n.menuInterval(
                    formatIntervalLabel(signals.refreshIntervalMin()),
                  ),
                  value: "interval",
                },
                { title: si18n.menuDone, value: "__done" },
              ]}
              onSelect={(opt: { value: string }) => {
                if (opt.value === "lang") showLangPicker();
                else if (opt.value === "border") showBorderPicker();
                else if (opt.value === "interval") showIntervalPicker();
                else dialog?.clear();
              }}
            />
          ));
        }

        function showLangPicker() {
          const cur = signals.langZH();
          const si18n = getSettingsTranslations(cur);
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={si18n.menuLang}
              options={[
                { title: `中文    ${cur ? "\u2713" : ""}`, value: "zh" },
                { title: `English ${cur ? "" : "\u2713"}`, value: "en" },
              ]}
              onSelect={(opt: { value: string }) => {
                const zh = opt.value === "zh";
                api.kv.set(`${KV}.lang`, opt.value);
                signals.setLangZH(zh);
                showMenu();
              }}
            />
          ));
        }

        function showBorderPicker() {
          const si18n = getSettingsTranslations(signals.langZH());
          const border = Boolean(api.kv.get(`${KV}.border`, true));
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={si18n.menuBorder}
              options={[
                {
                  title: `${si18n.on}  ${!border ? "\u2713" : ""}`,
                  value: "on",
                },
                {
                  title: `${si18n.off}  ${border ? "\u2713" : ""}`,
                  value: "off",
                },
              ]}
              onSelect={(opt: { value: string }) => {
                const on = opt.value === "on";
                api.kv.set(`${KV}.border`, on);
                signals.setBorderVisible(on);
                showMenu();
              }}
            />
          ));
        }

        function showIntervalPicker() {
          const si18n = getSettingsTranslations(signals.langZH());
          const cur = signals.refreshIntervalMin();
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={si18n.intervalTitle}
              options={[
                ...si18n.intervalPresets.map((p) => ({
                  title: `${p.label}${p.minutes === cur ? "  \u2713" : ""}`,
                  value: String(p.minutes),
                })),
                { title: si18n.intervalCustom, value: "__custom" },
              ]}
              onSelect={(opt: { value: string }) => {
                if (opt.value === "__custom") {
                  showCustomInterval();
                  return;
                }
                applyInterval(Number(opt.value));
              }}
            />
          ));
        }

        function showCustomInterval() {
          const si18n = getSettingsTranslations(signals.langZH());
          dialog?.replace(() => (
            <api.ui.DialogPrompt
              title={si18n.intervalCustomTitle}
              placeholder={si18n.intervalCustomPlaceholder}
              onConfirm={(raw) => {
                const n = Math.round(Number(raw));
                if (raw.trim() === "" || !isValidInterval(n)) {
                  api.ui.toast({
                    variant: "error",
                    message: si18n.intervalInvalid(
                      MIN_REFRESH_INTERVAL_MIN,
                      MAX_REFRESH_INTERVAL_MIN,
                    ),
                  });
                  return;
                }
                applyInterval(n);
              }}
              onCancel={showIntervalPicker}
            />
          ));
        }

        function applyInterval(minutes: number) {
          const si18n = getSettingsTranslations(signals.langZH());
          api.kv.set(`${KV}.interval`, minutes);
          signals.setRefreshIntervalMin(minutes);
          api.ui.toast({
            variant: "success",
            message: si18n.intervalSaved(si18n.minutes(minutes)),
          });
          showMenu();
        }

        showMenu();
      },
    },
    {
      title: "GLM: Manage MCP Servers",
      value: "glm.mcp",
      description: "Install or uninstall GLM Coding Plan MCP servers",
      slash: { name: "glm-mcp-manage", aliases: ["glm-mcp-install"] },
      onSelect: (dialog?: TuiDialogStack) => {
        const mi18n = getMcpTranslations(signals.langZH());

        const projectDir = api.state.path.directory || process.cwd() || ".";

        // ── Step 1: scope ──
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title={mi18n.scopeTitle}
            options={[
              {
                title: mi18n.local,
                description: mi18n.localDesc,
                value: "local" as Scope,
              },
              {
                title: mi18n.global,
                description: mi18n.globalDesc,
                value: "global" as Scope,
              },
            ]}
            onSelect={(opt: { value: Scope }) => showServerPicker(opt.value)}
          />
        ));

        // ── Step 2: checkbox list seeded from the scope's live config ──
        // Checked = installed, unchecked = not installed. Only servers whose
        // toggle differs from the entry state are installed / uninstalled.
        function showServerPicker(scope: Scope) {
          const mi18nScope = mi18n.scopeLabel(scope);
          const initial = getInstalledGlmMcp(scope, projectDir);
          let selected = new Set<string>(initial);

          function applyChanges(snap: ReadonlySet<string>) {
            applyMcpSelection({
              scope,
              projectDir,
              initial,
              selected: snap,
              i18n: mi18n,
              toast: { toast: (o) => api.ui.toast(o) },
            });
          }

          function render() {
            const snap = new Set(selected);
            const allOn = snap.size === GLM_MCP_SERVER_NAMES.length;
            const { toInstall, toUninstall } = diffMcpSelection(initial, snap);

            dialog?.replace(() => (
              <api.ui.DialogSelect
                title={mi18n.pickTitle(mi18nScope)}
                placeholder={mi18n.pickHint}
                options={[
                  ...GLM_MCP_SERVER_NAMES.map((name) => {
                    const meta = mi18n.servers[name];
                    return {
                      title: `${snap.has(name) ? "\u2713" : "\u25cb"}  ${meta.label}`,
                      description: meta.desc,
                      value: name,
                    };
                  }),
                  {
                    title: `${allOn ? "\u25cb" : "\u2713"}  ${allOn ? mi18n.deselectAll : mi18n.selectAll}`,
                    value: "__bulk",
                  },
                  {
                    title: mi18n.confirm(
                      toInstall.length,
                      toUninstall.length,
                      mi18nScope,
                    ),
                    value: "__confirm",
                  },
                ]}
                onSelect={(opt: { value: string }) => {
                  if (opt.value === "__confirm") {
                    applyChanges(snap);
                    dialog?.clear();
                  } else if (opt.value === "__bulk") {
                    selected = allOn
                      ? new Set()
                      : new Set(GLM_MCP_SERVER_NAMES);
                    render();
                  } else {
                    if (selected.has(opt.value)) selected.delete(opt.value);
                    else selected.add(opt.value);
                    render();
                  }
                }}
              />
            ));
          }

          render();
        }
      },
    },
  ];
}
