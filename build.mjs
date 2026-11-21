import * as esbuild from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

// Dual-format entry ({ id, tui, setup }) — bundled straight to `dist/tui.js`,
// which IS the `./tui` export target loaded by both hosts:
// V1 hosts read the `tui` field, V2 hosts read the `setup` field.
// @opentui/* + solid-js stay external: the bundle must share the host's
// renderer context (inlining yields "No renderer found"); @opencode-ai/* is
// type-only and erased at build time.
await esbuild.build({
  entryPoints: ["src/tui.ts"],
  outfile: "dist/tui.js",
  format: "esm",
  platform: "node",
  bundle: true,
  external: ["@opencode-ai/*", "@opentui/*", "solid-js"],
  plugins: [
    solidPlugin({
      solid: { moduleName: "@opentui/solid", generate: "universal" },
    }),
  ],
});

// Server entry — dist/index.js (the `./server` export target AND the
// local-directory plugin convention: a config entry pointing at a
// directory makes the server load that directory's index.js — verified
// against host v2.3.0; the sibling providers ship dist/index.js the same
// way). Pure node code, no JSX — no solid plugin; same externals policy
// as the TUI bundle.
await esbuild.build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/index.js",
  format: "esm",
  platform: "node",
  bundle: true,
  external: ["@opencode-ai/*", "@opentui/*", "solid-js"],
});
