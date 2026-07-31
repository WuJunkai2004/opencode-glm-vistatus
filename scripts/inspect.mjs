// Inspector — fetches live GLM Monitor data and pretty-prints every step's
// return value, flagging which fields are valid (non-null) vs empty.
//
// Reuses the real source logic (auth discovery, fetch, parser) by bundling
// src/api + src/utils with esbuild at runtime — no logic duplication.
//
// Usage:  npm run inspect
//         node scripts/inspect.mjs
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/");
const srcUrl = (rel) => ROOT + rel;

// --- ANSI helpers (auto-disabled when piped to a file) ----------------------
const TTY = process.stdout.isTTY;
const c = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = c("32"),
  red = c("31"),
  yellow = c("33"),
  dim = c("2"),
  bold = c("1");
const ok = green("valid"),
  no = red("null"),
  hr = dim("─".repeat(60));

function banner(title) {
  console.log(`\n${hr}\n ${bold(title)}\n${hr}`);
}
function mask(token) {
  if (!token) return no;
  const t = String(token);
  if (t.length <= 8)
    return `${t.slice(0, 2)}…${t.slice(-2)} (${t.length} chars)`;
  return `${t.slice(0, 4)}…${t.slice(-4)} (${t.length} chars)`;
}
function statusOf(value) {
  const present =
    value !== null &&
    value !== undefined &&
    !(typeof value === "number" && !Number.isFinite(value));
  return present ? ok : no;
}
function bytes(n) {
  if (!n) return "0 B";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}

// --- Bundle the pure source modules (no solid/plugin deps) ------------------
async function loadModules() {
  const tmp = mkdtempSync(join(tmpdir(), "glm-inspect-"));
  const entry = join(tmp, "entry.mjs");
  const outfile = join(tmp, "bundle.mjs");

  writeFileSync(
    entry,
    [
      `export { getCredentials } from "${srcUrl("src/utils/auth.ts")}";`,
      `export { fetchAllQuota } from "${srcUrl("src/api/client.ts")}";`,
      `export { parseQuotaData } from "${srcUrl("src/utils/quota-parser.ts")}";`,
      `export { getTimeWindow, getTimeWindowQueryParams } from "${srcUrl("src/utils/time-window.ts")}";`,
      `export {       formatNumberFull,
      formatPercentage, formatResetCountdown, formatResetClock } from "${srcUrl("src/utils/format.ts")}";`,
      `export { detectPlatform, getPlatformName } from "${srcUrl("src/api/platforms.ts")}";`,
      `export { getEndpoints } from "${srcUrl("src/api/endpoints.ts")}";`,
    ].join("\n"),
  );

  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "esnext",
    logLevel: "silent",
    outfile,
  });

  return { mod: await import(pathToFileURL(outfile).href), tmp };
}

// --- unwrap envelope { data } exactly like quota-parser does ----------------
function unwrapData(response) {
  if (!response) return null;
  const data = response.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return response;
}

async function main() {
  const { mod, tmp } = await loadModules();
  try {
    const {
      getCredentials,
      fetchAllQuota,
      parseQuotaData,
      getTimeWindow,
      getTimeWindowQueryParams,
      formatNumberFull,
      formatPercentage,
      formatResetCountdown,
      formatResetClock,
      getPlatformName,
    } = mod;

    banner("GLM vistatus — Inspector");

    // [1] Credentials --------------------------------------------------------
    banner("[1] Credentials  (auth discovery)");
    const cred = getCredentials();
    if (!cred) {
      console.log(`  ${red("✗ no credentials found")}`);
      console.log(
        `    Set ${yellow("ZAI_API_KEY")} / ${yellow("ZHIPU_API_KEY")} or sign in via opencode.`,
      );
      return;
    }
    console.log(`  platform : ${getPlatformName(cred.platform)}  ${ok}`);
    console.log(`  token    : ${mask(cred.token)}`);

    // [2] Time window --------------------------------------------------------
    banner("[2] Time window  (24h rolling query)");
    const tw = getTimeWindow();
    console.log(`  start    : ${tw.startTime}`);
    console.log(`  end      : ${tw.endTime}`);
    console.log(`  ${dim("query    : " + getTimeWindowQueryParams())}`);

    // [3] Raw API responses --------------------------------------------------
    banner("[3] Raw API responses");
    const { quotaData, modelData, toolData } = await fetchAllQuota(
      cred.token,
      cred.platform,
    );
    const raw = {
      "quota/limit": quotaData,
      "model-usage": modelData,
      "tool-usage": toolData,
    };
    for (const [name, data] of Object.entries(raw)) {
      const present = data !== null;
      const size = present ? bytes(JSON.stringify(data).length) : "";
      console.log(
        `  ▸ ${name.padEnd(12)} [${present ? ok : no}]${size ? "  " + dim("(" + size + ")") : ""}`,
      );
      if (present) {
        console.log(dim(JSON.stringify(data, null, 2).replace(/^/gm, "    ")));
      } else {
        console.log(`    ${dim("(no data — request failed or non-ok)")}`);
      }
    }

    // [4] Parsed quota -------------------------------------------------------
    banner("[4] Parsed quota  (parseQuotaData output)");
    const parsed = parseQuotaData(quotaData, modelData);

    function item(label, it) {
      if (!it) {
        console.log(`  ${label.padEnd(10)} : ${no}`);
        return;
      }
      const parts = [
        `pct=${formatPercentage(it.percentage)}`,
        it.total != null
          ? `total=${formatNumberFull(it.total)}`
          : "total=" + no,
        it.nextResetTime != null
          ? `reset=${formatResetCountdown(it.nextResetTime)} @ ${formatResetClock(it.nextResetTime)}`
          : "reset=" + no,
      ];
      console.log(
        `  ${label.padEnd(10)} : ${green("✓")} { ${parts.join(", ")} }`,
      );
    }

    console.log(
      `  level     : ${parsed.level ?? no}  ${statusOf(parsed.level)}`,
    );
    item("fiveHour", parsed.fiveHour);
    item("weekly", parsed.weekly);

    // MCP block
    if (!parsed.mcp) {
      console.log(`  mcp       : ${no}`);
    } else {
      const m = parsed.mcp;
      console.log(
        `  mcp       : ${green("✓")} { pct=${formatPercentage(m.percentage)}, ` +
          `current=${m.current != null ? formatNumberFull(m.current) : no}, ` +
          `total=${m.total != null ? formatNumberFull(m.total) : no} }`,
      );
      if (m.details.length) {
        for (const d of m.details) {
          console.log(
            `             · ${d.modelCode}: ${formatNumberFull(d.usage)}`,
          );
        }
      } else {
        console.log(`             ${dim("(no per-model details)")}`);
      }
    }

    console.log(
      `  tokenUsed : ${parsed.tokenUsed != null ? formatNumberFull(parsed.tokenUsed) : no}  ${statusOf(parsed.tokenUsed)}`,
    );
    const limitIsDefault = parsed.fiveHour == null && parsed.weekly == null;
    console.log(
      `  tokenLimit: ${formatNumberFull(parsed.tokenLimit)}` +
        (limitIsDefault
          ? `  ${yellow("(default, no live limit matched)")}`
          : `  ${ok}`),
    );

    // [5] Raw limit items → classification hint ------------------------------
    banner("[5] Raw limit items  (classification aid)");
    console.log(dim("  rule: TOKENS_LIMIT unit=3 number=5 → fiveHour"));
    console.log(dim("        TOKENS_LIMIT unit=6 number=1 → weekly"));
    console.log(dim("        TIME_LIMIT                → mcp"));
    const q = unwrapData(quotaData);
    const limits = Array.isArray(q?.limits) ? q.limits : [];
    if (!limits.length) {
      console.log(`  ${no}  (limits array missing/empty)`);
    } else {
      limits.forEach((it, i) => {
        const f = (v) => (v == null ? dim("·") : String(v));
        const row = [
          `type=${f(it.type)}`,
          `unit=${f(it.unit)}`,
          `number=${f(it.number)}`,
          `pct=${f(it.percentage)}`,
          `total=${f(it.total)}`,
          `currentValue=${f(it.currentValue)}`,
          `usage=${f(it.usage)}`,
        ];
        console.log(`  [${String(i).padStart(2)}] ${row.join(dim(", "))}`);
      });
    }

    // [6] Summary ------------------------------------------------------------
    banner("[6] Validity summary");
    const checks = {
      credentials: cred,
      "quota/limit response": quotaData,
      "model-usage response": modelData,
      "tool-usage response": toolData,
      "parsed.level": parsed.level,
      "parsed.fiveHour": parsed.fiveHour,
      "parsed.weekly": parsed.weekly,
      "parsed.mcp": parsed.mcp,
      "parsed.tokenUsed": parsed.tokenUsed,
    };
    for (const [k, v] of Object.entries(checks)) {
      console.log(`  ${k.padEnd(22)} ${statusOf(v)}`);
    }
    console.log(`\n${dim("done.")}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(red("inspect failed: " + (e?.stack || e)));
  process.exit(1);
});
