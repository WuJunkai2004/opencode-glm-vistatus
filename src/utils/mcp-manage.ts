/**
 * Host-neutral `/glm-mcp-manage` business logic shared by the V1 callback
 * dialogs (`src/v1/commands.tsx`) and the V2 promise dialogs
 * (`src/v2/commands.ts`): compute the install/uninstall diff against the
 * scope's live config, apply only what changed, report via toasts.
 */

import { getCredentials } from "./auth";
import {
  installGlmMcp,
  uninstallGlmMcp,
  GLM_MCP_SERVER_NAMES,
  type Scope,
} from "./mcp-servers";
import type { McpI18n } from "../ui/i18n";

/**
 * Minimal toast surface provided by both hosts (V1 `api.ui.toast`,
 * V2 `context.ui.toast.show`).
 */
export interface ToastPort {
  toast(options: {
    message: string;
    title?: string;
    variant?: "info" | "success" | "warning" | "error";
    duration?: number;
  }): void;
}

/** Servers whose toggle differs from the scope's entry state. */
export function diffMcpSelection(
  initial: ReadonlySet<string>,
  selected: ReadonlySet<string>,
): { toInstall: string[]; toUninstall: string[] } {
  return {
    toInstall: GLM_MCP_SERVER_NAMES.filter(
      (n) => selected.has(n) && !initial.has(n),
    ),
    toUninstall: GLM_MCP_SERVER_NAMES.filter(
      (n) => !selected.has(n) && initial.has(n),
    ),
  };
}

/**
 * Install/uninstall exactly the servers whose toggle differs from `initial`
 * (the scope's state when the picker opened) and toast the outcome.
 */
export function applyMcpSelection(params: {
  scope: Scope;
  projectDir: string;
  /** Entry state of the scope when the picker opened. */
  initial: ReadonlySet<string>;
  /** Final checkbox state to apply. */
  selected: ReadonlySet<string>;
  i18n: McpI18n;
  toast: ToastPort;
}): void {
  const { scope, projectDir, initial, selected, i18n, toast } = params;
  const { toInstall, toUninstall } = diffMcpSelection(initial, selected);
  const scopeLabel = i18n.scopeLabel(scope);

  if (toInstall.length === 0 && toUninstall.length === 0) {
    toast.toast({ message: i18n.noChange });
    return;
  }

  const creds = toInstall.length > 0 ? getCredentials() : null;
  if (toInstall.length > 0 && !creds) {
    toast.toast({ variant: "error", message: i18n.noCred });
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
    toast.toast({
      variant: "error",
      title: i18n.failTitle,
      message: errors.join(" · "),
      duration: 10000,
    });
  } else {
    toast.toast({
      variant: "success",
      title: i18n.okTitle,
      message: i18n.okMsg(installed, removed, scopeLabel, filePath),
      duration: 10000,
    });
  }
}
