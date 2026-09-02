/** @jsxImportSource @opentui/solid */

import type { JSX } from "@opentui/solid";
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiSlotContext,
  TuiSlotPlugin,
  TuiPluginModule,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui";
import {
  createMemo,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { PLUGIN_VERSION } from "./_version";

import { getCredentials } from "./utils/auth";
import {
  installGlmMcp,
  uninstallGlmMcp,
  GLM_MCP_SERVER_NAMES,
  type Scope,
} from "./utils/mcp-servers";
import { fetchAllQuota } from "./api/client";
import { parseQuotaData, type ParsedQuota } from "./utils/quota-parser";
import { getPlatformName } from "./api/platforms";
import {
  formatNumber,
  formatPercentage,
  formatResetCountdown,
  formatResetClock,
  formatClockShort,
} from "./utils/format";
import { visualWidth, truncateVisual, progressBar } from "./ui/widgets";
import {
  buildPalette,
  dimColor,
  quotaColor,
  type ThemePalette,
} from "./ui/theme";
import {
  getTranslations,
  getMcpTranslations,
  type Translations,
} from "./ui/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MIN_PANEL_WIDTH = 20;
const DEFAULT_PANEL_WIDTH = 30;
const KV = "glm_quota_panel";

// Layout measurement constants (visual columns)
const BAR_BRACKETS = 2; // "[" + "]"
const BAR_GAP = 1; // space after "]"
const HEADER_PREFIX = 2; // "▼ " or "▶ "

// Language auto-detection
const DEBUG_LANG =
  typeof process !== "undefined" ? process.env?.GLM_VISTATUS_LANG : undefined;
const LANG_ZH = DEBUG_LANG
  ? DEBUG_LANG === "zh"
  : (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
      } catch {
        return false;
      }
    })();

// ---------------------------------------------------------------------------
// Shared signals (created in tui function scope)
// ---------------------------------------------------------------------------

interface PanelSignals {
  langZH: () => boolean;
  setLangZH: (v: boolean) => void;
  borderVisible: () => boolean;
  setBorderVisible: (v: boolean) => void;
  forceRefresh: () => number;
  setForceRefresh: (v: number) => void;
}

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

function GlmQuotaPanel(props: {
  theme: TuiThemeCurrent;
  api: TuiPluginApi;
  signals: PanelSignals;
}): JSX.Element {
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_PANEL_WIDTH);
  const [quotaData, setQuotaData] = createSignal<ParsedQuota | null>(null);
  const [platformName, setPlatformName] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [lastUpdate, setLastUpdate] = createSignal<Date | null>(null);
  const [open, setOpen] = createSignal(true);
  let boxEl: any;

  const { langZH, borderVisible } = props.signals;
  const t = createMemo<Translations>(() => getTranslations(langZH()));
  const pal = createMemo<ThemePalette>(() => buildPalette(props.theme));

  // ── Refresh logic ──
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const creds = getCredentials();
      if (!creds) {
        setError(t().noCred);
        setLoading(false);
        return;
      }

      setPlatformName(getPlatformName(creds.platform));
      const result = await fetchAllQuota(creds.token, creds.platform);
      const parsed = parseQuotaData(result.quotaData, result.modelData);
      setQuotaData(parsed);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    setPanelWidth(DEFAULT_PANEL_WIDTH);

    // Restore fold state from kv
    try {
      if (props.api.kv.ready) {
        setOpen(Boolean(props.api.kv.get(`${KV}.open`, true)));
      } else {
        // Poll kv.ready with a timeout
        let tries = 0;
        const poll = () => {
          if (!props.api.kv.ready) {
            if (++tries > 100) {
              setOpen(Boolean(props.api.kv.get(`${KV}.open`, true)));
              return;
            }
            setTimeout(poll, 10);
            return;
          }
          setOpen(Boolean(props.api.kv.get(`${KV}.open`, true)));
        };
        poll();
      }
    } catch {}

    // First fetch
    refresh();

    // Auto-refresh every 5 minutes
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
  });

  onCleanup(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  // ── React to manual force-refresh signal ──
  createEffect(() => {
    const tick = props.signals.forceRefresh();
    if (tick > 0) refresh();
  });

  // ── Persist fold state ──
  const persistFold = (key: string, val: boolean) => {
    try {
      props.api.kv.set(`${KV}.${key}`, val);
    } catch {}
  };

  // ── Layout helpers ──
  const gutter = createMemo(() => (borderVisible() ? 6 : 0));
  const sep = createMemo(() =>
    "\u2500".repeat(Math.max(1, panelWidth() - gutter())),
  );

  // ── Labeled value line: accent label + bright value, right-aligned ──
  const labeledValue = (label: string, value: string): JSX.Element => {
    const gauge = panelWidth() - gutter();
    const gap = Math.max(1, gauge - visualWidth(label) - visualWidth(value));
    return (
      <text>
        <span style={{ fg: pal().info }}>{label}</span>
        <span style={{ fg: pal().accent }}>{" ".repeat(gap) + value}</span>
      </text>
    );
  };

  // ── Folded header percentage (5h usage) ──
  const foldedPct = createMemo(() => {
    const d = quotaData();
    if (!d?.fiveHour) return "";
    return formatPercentage(d.fiveHour.percentage);
  });

  // Resync panel width after border toggle
  createEffect(() => {
    borderVisible();
    if (boxEl && typeof boxEl.width === "number" && boxEl.width > 0) {
      const w = Math.max(MIN_PANEL_WIDTH, boxEl.width);
      setPanelWidth((prev) => (prev === w ? prev : w));
    }
  });

  // ── Render a quota block (multi-line layout) ──
  function renderQuotaBlock(
    label: string,
    percentage: number,
    used: number | null,
    total: number | null,
    resetTime: number | null,
  ): JSX.Element {
    const gauge = panelWidth() - gutter();
    const color = quotaColor(percentage, pal());
    const pct = formatPercentage(percentage);
    const pctW = visualWidth(pct);

    // Line 1: label (left) + used/total (right) — only when API provides total
    const hasUsedTotal = used !== null && total !== null;
    const usedTotal = hasUsedTotal
      ? formatNumber(used) + "/" + formatNumber(total)
      : "";

    // Line 2: full-width bar (left) + percentage (right)
    const barWidth = Math.max(3, gauge - BAR_BRACKETS - BAR_GAP - pctW);
    const bar = progressBar(percentage, barWidth);

    // Line 3: reset info (left)
    const countdown = formatResetCountdown(resetTime);
    const clock = formatResetClock(resetTime);

    const labelW = visualWidth(label);
    const valW = visualWidth(usedTotal);
    const line1Gap = hasUsedTotal ? Math.max(1, gauge - labelW - valW) : 0;

    return (
      <>
        <text>
          <span style={{ fg: pal().info }}>{label}</span>
          <Show when={hasUsedTotal}>
            <span style={{ fg: pal().accent }}>
              {" ".repeat(line1Gap) + usedTotal}
            </span>
          </Show>
        </text>
        <text>
          <span style={{ fg: color }}>[{bar}]</span>
          <span style={{ fg: pal().accent }}>{" ".repeat(BAR_GAP) + pct}</span>
        </text>
        <Show when={resetTime !== null}>
          <text>
            <span style={{ fg: pal().muted }}>
              {t().resetsIn + ": " + countdown}
            </span>
            <Show when={clock}>
              <span style={{ fg: dimColor(pal().muted, 0.75) }}>
                {" (" + clock + ")"}
              </span>
            </Show>
          </text>
        </Show>
      </>
    );
  }

  return (
    <box
      border={borderVisible()}
      {...(borderVisible() ? { borderColor: pal().border } : {})}
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={borderVisible() ? 2 : 0}
      paddingRight={borderVisible() ? 2 : 0}
      flexDirection="column"
      gap={0}
      ref={boxEl}
      onSizeChange={() => {
        const w = boxEl
          ? Math.max(MIN_PANEL_WIDTH, boxEl.width ?? 0)
          : DEFAULT_PANEL_WIDTH;
        setPanelWidth((prev) => (prev === w ? prev : w));
      }}
    >
      {/* Collapsible header */}
      <text
        onMouseUp={() =>
          setOpen((o) => {
            const n = !o;
            persistFold("open", n);
            return n;
          })
        }
      >
        <span style={{ fg: pal().muted }}>
          {open() ? "\u25bc " : "\u25b6 "}
        </span>
        <span style={{ fg: pal().primary }}>
          <b>{t().title}</b>
          <Show when={open()}>
            <span style={{ fg: dimColor(pal().muted, 0.6) }}>
              {" "}
              v{PLUGIN_VERSION}
            </span>
          </Show>
        </span>
        {/* Expanded: show last update time right-aligned */}
        <Show when={open() && lastUpdate()}>
          <span style={{ fg: dimColor(pal().muted, 0.7) }}>
            {" ".repeat(
              Math.max(
                1,
                panelWidth() -
                  gutter() -
                  HEADER_PREFIX -
                  visualWidth(t().title) -
                  visualWidth(" v" + PLUGIN_VERSION) -
                  visualWidth(formatClockShort(lastUpdate()!)),
              ),
            ) + formatClockShort(lastUpdate()!)}
          </span>
        </Show>
        {/* Folded: show 5h usage percentage */}
        <Show when={!open() && foldedPct()}>
          <span>
            {" ".repeat(
              Math.max(
                1,
                panelWidth() -
                  gutter() -
                  HEADER_PREFIX -
                  visualWidth(t().title) -
                  visualWidth(foldedPct() + " " + t().collapsed),
              ),
            )}
          </span>
          <span
            style={{
              fg: quotaColor(quotaData()?.fiveHour?.percentage ?? 0, pal()),
            }}
          >
            {foldedPct()} {t().collapsed}
          </span>
        </Show>
      </text>

      <Show when={open()}>
        {/* Separator */}
        <text fg={pal().muted}>{sep()}</text>

        {/* Platform info */}
        <Show when={platformName()}>
          {labeledValue(t().platform + ":", platformName())}
        </Show>

        {/* Plan level */}
        <Show when={quotaData()?.level}>
          {labeledValue(t().plan + ":", quotaData()!.level!)}
        </Show>

        {/* Loading state */}
        <Show when={loading() && !quotaData() && !error()}>
          <text>
            <span style={{ fg: pal().muted }}>{"> "}</span>
            <span style={{ fg: pal().muted }}>{t().refreshing}</span>
          </text>
        </Show>

        {/* Error state */}
        <Show when={error()}>
          <text>
            <span style={{ fg: pal().error }}>{"\u26a0 " + t().error}</span>
          </text>
          <Show when={error() === t().noCred}>
            <text fg={pal().muted}>{"  " + t().noCredHint}</text>
          </Show>
          <Show when={error() !== t().noCred}>
            <text fg={pal().muted}>
              {"  " + truncateVisual(error()!, panelWidth() - gutter() - 2)}
            </text>
          </Show>
        </Show>

        {/* No data (not loading, not error, no quota) */}
        <Show when={!loading() && !error() && !quotaData()}>
          <text>
            <span style={{ fg: pal().muted }}>{"> "}</span>
            <span style={{ fg: pal().muted }}>{t().noData}</span>
          </text>
        </Show>

        {/* Quota data */}
        <Show when={quotaData()}>
          {/* 5h Token */}
          <Show when={quotaData()!.fiveHour}>
            {(() => {
              const q = quotaData()!.fiveHour!;
              const used =
                q.total !== null
                  ? Math.round((q.total * q.percentage) / 100)
                  : null;
              return renderQuotaBlock(
                t().token5h,
                q.percentage,
                used,
                q.total,
                q.nextResetTime,
              );
            })()}
          </Show>

          {/* Weekly */}
          <Show when={quotaData()!.weekly}>
            {(() => {
              const q = quotaData()!.weekly!;
              const used =
                q.total !== null
                  ? Math.round((q.total * q.percentage) / 100)
                  : null;
              return renderQuotaBlock(
                t().weekly,
                q.percentage,
                used,
                q.total,
                q.nextResetTime,
              );
            })()}
          </Show>

          {/* MCP (no reset line) */}
          <Show when={quotaData()!.mcp}>
            {(() => {
              const mcp = quotaData()!.mcp!;
              return renderQuotaBlock(
                t().mcp,
                mcp.percentage,
                mcp.current,
                mcp.total,
                null,
              );
            })()}
          </Show>
        </Show>
      </Show>
    </box>
  );
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

function createSidebarSlot(
  api: TuiPluginApi,
  signals: PanelSignals,
): TuiSlotPlugin {
  return {
    order: 60, // After visual-cache (55)
    slots: {
      sidebar_content(
        ctx: TuiSlotContext,
        _input: { session_id: string },
      ): JSX.Element {
        return (
          <GlmQuotaPanel
            theme={ctx.theme.current}
            api={api}
            signals={signals}
          />
        );
      },
    },
  };
}

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  const [langZH, setLangZH] = createSignal(LANG_ZH);
  const [borderVisible, setBorderVisible] = createSignal(true);
  const [forceRefresh, setForceRefresh] = createSignal(0);

  const signals: PanelSignals = {
    langZH,
    setLangZH,
    borderVisible,
    setBorderVisible,
    forceRefresh,
    setForceRefresh,
  };

  // Restore config from kv
  const restoreConfig = () => {
    try {
      const savedLang = api.kv.get<string>(`${KV}.lang`);
      if (savedLang === "zh" || savedLang === "en")
        setLangZH(savedLang === "zh");
      setBorderVisible(api.kv.get<boolean>(`${KV}.border`, true) !== false);
    } catch {}
  };

  if (api.kv.ready) {
    restoreConfig();
  } else {
    let tries = 0;
    const poll = () => {
      if (!api.kv.ready) {
        if (++tries > 100) {
          restoreConfig();
          return;
        }
        setTimeout(poll, 10);
        return;
      }
      restoreConfig();
    };
    poll();
  }

  api.slots.register(createSidebarSlot(api, signals));

  // ── Slash commands ──
  api.command?.register(() => [
    {
      title: "GLM: Refresh Now",
      value: "glm.refresh",
      description: "Force refresh GLM quota data immediately",
      slash: { name: "glm-refresh" },
      onSelect: (dialog) => {
        signals.setForceRefresh(Date.now());
        api.ui.toast({
          message: langZH()
            ? "正在刷新 GLM 额度..."
            : "Refreshing GLM quota...",
        });
        dialog?.clear();
      },
    },
    {
      title: "GLM: Switch Language",
      value: "glm.lang",
      description: "Switch between Chinese and English display",
      slash: { name: "glm-lang" },
      onSelect: (dialog) => {
        const cur = langZH();
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title="Display Language"
            options={[
              { title: `中文    ${cur ? "\u2713" : ""}`, value: "zh" },
              { title: `English ${cur ? "" : "\u2713"}`, value: "en" },
            ]}
            onSelect={(opt: { value: string }) => {
              const zh = opt.value === "zh";
              api.kv.set(`${KV}.lang`, opt.value);
              setLangZH(zh);
              api.ui.toast({
                message: zh ? "语言已切换为中文" : "Switched to English",
              });
              dialog?.clear();
            }}
          />
        ));
      },
    },
    {
      title: "GLM: Toggle Border",
      value: "glm.section",
      description: "Show or hide the panel border",
      slash: { name: "glm-section" },
      onSelect: (dialog) => {
        const borderOn = Boolean(api.kv.get(`${KV}.border`, true));
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title="Toggle Border"
            options={[
              {
                title: `Panel Border  [${borderOn ? "ON" : "OFF"}]`,
                value: "border",
              },
            ]}
            onSelect={(opt: { value: string }) => {
              if (opt.value === "border") {
                const cur = Boolean(api.kv.get(`${KV}.border`, true));
                api.kv.set(`${KV}.border`, !cur);
                signals.setBorderVisible(!cur);
                api.ui.toast({
                  message: `Panel border ${!cur ? "shown" : "hidden"}`,
                });
              }
              dialog?.clear();
            }}
          />
        ));
      },
    },
    {
      title: "GLM: Show Config",
      value: "glm.config",
      description: "Display the current plugin configuration",
      slash: { name: "glm-config" },
      onSelect: (dialog) => {
        const border = Boolean(api.kv.get(`${KV}.border`, true));
        api.ui.toast({
          title: "GLM Quota Config",
          message: `Lang: ${langZH() ? "中文" : "English"}  |  Border: ${border ? "ON" : "OFF"}`,
          duration: 8000,
        });
        dialog?.clear();
      },
    },
    {
      title: "GLM: Manage MCP Servers",
      value: "glm.mcp",
      description: "Install or uninstall GLM Coding Plan MCP servers",
      slash: { name: "glm-mcp-manage", aliases: ["glm-mcp-install"] },
      onSelect: (dialog) => {
        const mi18n = getMcpTranslations(langZH());

        const projectDir = api.state.path.directory || process.cwd() || ".";

        // ── Step 1: action (install / uninstall) ──
        dialog?.replace(() => (
          <api.ui.DialogSelect
            title={mi18n.actionTitle}
            options={[
              {
                title: mi18n.actionInstall,
                description: mi18n.actionInstallDesc,
                value: "install" as const,
              },
              {
                title: mi18n.actionUninstall,
                description: mi18n.actionUninstallDesc,
                value: "uninstall" as const,
              },
            ]}
            onSelect={(opt: { value: "install" | "uninstall" }) => {
              if (opt.value === "uninstall") {
                showScopePicker("uninstall");
                return;
              }
              // Install needs credentials; uninstall works without them.
              const creds = getCredentials();
              if (!creds) {
                api.ui.toast({
                  variant: "error",
                  message: mi18n.noCred,
                });
                dialog?.clear();
                return;
              }
              showScopePicker("install");
            }}
          />
        ));

        // ── Step 2: scope ──
        function showScopePicker(mode: "install" | "uninstall") {
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={mi18n.scopeTitle(mode)}
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
              onSelect={(opt: { value: Scope }) =>
                showServerPicker(mode, opt.value)
              }
            />
          ));
        }

        // ── Step 3: server multi-select ──
        function showServerPicker(mode: "install" | "uninstall", scope: Scope) {
          let selected = new Set<string>(GLM_MCP_SERVER_NAMES);

          function render() {
            const snap = new Set(selected);
            const allOn = snap.size === GLM_MCP_SERVER_NAMES.length;
            const scopeLabel = mi18n.scopeLabel(scope);

            dialog?.replace(() => (
              <api.ui.DialogSelect
                title={mi18n.pickTitle(mode)}
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
                    title:
                      snap.size > 0
                        ? mi18n.confirm(mode, snap.size, scopeLabel)
                        : mi18n.noneSelected,
                    value: "__confirm",
                    disabled: snap.size === 0,
                  },
                ]}
                onSelect={(opt: { value: string }) => {
                  if (opt.value === "__confirm") {
                    const result =
                      mode === "uninstall"
                        ? uninstallGlmMcp(scope, projectDir, snap)
                        : (() => {
                            const creds = getCredentials();
                            if (!creds) return null;
                            return installGlmMcp(
                              creds.token,
                              creds.platform,
                              scope,
                              projectDir,
                              snap,
                            );
                          })();

                    if (!result) {
                      // Credentials vanished between step 1 and confirm.
                      api.ui.toast({
                        variant: "error",
                        message: mi18n.noCred,
                      });
                    } else if (result.ok) {
                      const changed =
                        "removed" in result
                          ? result.removed.length
                          : result.added.length;
                      const unchanged =
                        "missing" in result
                          ? result.missing.length
                          : result.skipped.length;
                      api.ui.toast({
                        variant: "success",
                        title: mi18n.okTitle(mode),
                        message: mi18n.okMsg(
                          mode,
                          changed,
                          unchanged,
                          mi18n.scopeLabel(result.scope),
                          result.filePath,
                        ),
                        duration: 10000,
                      });
                    } else {
                      api.ui.toast({
                        variant: "error",
                        title: mi18n.failTitle(mode),
                        message: result.error ?? "Unknown error",
                        duration: 10000,
                      });
                    }
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
  ]);
};

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-glm-vistatus",
  tui,
};

export default mod;
