/**
 * Dual-format TUI entry — bundled by esbuild to `dist/tui.js`, the target of
 * the package's `./tui` export (see `package.json`).
 *
 * V1 hosts call the `tui` field ({ id, tui } protocol, implemented in
 * `src/v1/index.tsx`); V2 hosts call `setup` ({ id, setup } protocol,
 * implemented in `src/v2/index.tsx`). Both share the sidebar panel in
 * `src/ui/panel.tsx` and the state/ business logic in `src/utils/`.
 */

import v1Mod from "./v1";
import v2Mod from "./v2";

const mod = {
  id: "opencode-glm-vistatus",
  tui: v1Mod.tui,
  setup: v2Mod.setup,
};

export default mod;
