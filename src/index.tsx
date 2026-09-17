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
  getInstalledGlmMcp,
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
  getSettingsTranslations,
  formatIntervalLabel,
  type Translations,
} from "./ui/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REFRESH_INTERVAL_MIN = 5; // minutes
const MIN_REFRESH_INTERVAL_MIN = 1;
const MAX_REFRESH_INTERVAL_MIN = 1440; // 24h
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
  refreshIntervalMin: () => number;
  setRefreshIntervalMin: (v: number) => void;
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
  });

  onCleanup(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  // ── Auto-refresh timer; rescheduled when the interval changes ──
  createEffect(() => {
    const minutes = props.signals.refreshIntervalMin();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, minutes * 60 * 1000);
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
  const [refreshIntervalMin, setRefreshIntervalMin] = createSignal(
    DEFAULT_REFRESH_INTERVAL_MIN,
  );
  const [forceRefresh, setForceRefresh] = createSignal(0);

  const signals: PanelSignals = {
    langZH,
    setLangZH,
    borderVisible,
    setBorderVisible,
    refreshIntervalMin,
    setRefreshIntervalMin,
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
      const savedInterval = api.kv.get<number>(`${KV}.interval`);
      if (
        typeof savedInterval === "number" &&
        Number.isFinite(savedInterval) &&
        savedInterval >= MIN_REFRESH_INTERVAL_MIN &&
        savedInterval <= MAX_REFRESH_INTERVAL_MIN
      ) {
        setRefreshIntervalMin(Math.round(savedInterval));
      }
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
      title: "GLM: Settings",
      value: "glm.config",
      description:
        "Open plugin settings (language / border / refresh interval)",
      slash: { name: "glm-config" },
      onSelect: (dialog) => {
        function showMenu() {
          const si18n = getSettingsTranslations(langZH());
          const border = Boolean(api.kv.get(`${KV}.border`, true));
          dialog?.replace(() => (
            <api.ui.DialogSelect
              title={si18n.menuTitle}
              options={[
                {
                  title: `${si18n.menuLang}  [${langZH() ? "中文" : "English"}]`,
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
          const cur = langZH();
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
                setLangZH(zh);
                showMenu();
              }}
            />
          ));
        }

        function showBorderPicker() {
          const si18n = getSettingsTranslations(langZH());
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
          const si18n = getSettingsTranslations(langZH());
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
          const si18n = getSettingsTranslations(langZH());
          dialog?.replace(() => (
            <api.ui.DialogPrompt
              title={si18n.intervalCustomTitle}
              placeholder={si18n.intervalCustomPlaceholder}
              onConfirm={(raw) => {
                const n = Math.round(Number(raw));
                if (
                  raw.trim() === "" ||
                  !Number.isFinite(n) ||
                  n < MIN_REFRESH_INTERVAL_MIN ||
                  n > MAX_REFRESH_INTERVAL_MIN
                ) {
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
          const si18n = getSettingsTranslations(langZH());
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
      onSelect: (dialog) => {
        const mi18n = getMcpTranslations(langZH());

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

          const diff = (snap: ReadonlySet<string>) => ({
            toInstall: GLM_MCP_SERVER_NAMES.filter(
              (n) => snap.has(n) && !initial.has(n),
            ),
            toUninstall: GLM_MCP_SERVER_NAMES.filter(
              (n) => !snap.has(n) && initial.has(n),
            ),
          });

          function applyChanges(snap: ReadonlySet<string>) {
            const { toInstall, toUninstall } = diff(snap);

            if (toInstall.length === 0 && toUninstall.length === 0) {
              api.ui.toast({ message: mi18n.noChange });
              return;
            }

            const creds = toInstall.length > 0 ? getCredentials() : null;
            if (toInstall.length > 0 && !creds) {
              api.ui.toast({ variant: "error", message: mi18n.noCred });
              return;
            }

            const errors: string[] = [];
            let filePath = "";
            let installed = 0;
            let removed = 0;

            if (creds && toInstall.length > 0) {
              const r = installGlmMcp(
                creds.token,
                creds.platform,
                scope,
                projectDir,
                new Set(toInstall),
              );
              filePath = r.filePath;
              if (r.ok) installed = r.added.length;
              else errors.push(r.error ?? "Unknown error");
            }

            if (toUninstall.length > 0) {
              const r = uninstallGlmMcp(scope, projectDir, new Set(toUninstall));
              filePath = r.filePath;
              if (r.ok) removed = r.removed.length;
              else errors.push(r.error ?? "Unknown error");
            }

            if (errors.length > 0) {
              api.ui.toast({
                variant: "error",
                title: mi18n.failTitle,
                message: errors.join(" · "),
                duration: 10000,
              });
            } else {
              api.ui.toast({
                variant: "success",
                title: mi18n.okTitle,
                message: mi18n.okMsg(installed, removed, mi18nScope, filePath),
                duration: 10000,
              });
            }
          }

          function render() {
            const snap = new Set(selected);
            const allOn = snap.size === GLM_MCP_SERVER_NAMES.length;
            const { toInstall, toUninstall } = diff(snap);

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
  ]);
};

const mod: TuiPluginModule & { id: string } = {
  id: "opencode-glm-vistatus",
  tui,
};

export default mod;
