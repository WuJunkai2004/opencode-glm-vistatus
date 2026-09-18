/**
 * Minimal local types for the OpenCode V2 (opencode2) TUI plugin API.
 *
 * The runtime shapes are provided by the V2 host when it loads the package's
 * `./tui` export (see `tui/index.js`); these interfaces exist only so this
 * package can typecheck standalone, mirroring the upstream context contract.
 */

export interface Theme {
  readonly hue: {
    /** V2 equivalent of V1 `primary` (official v1-migrate: interactive = primary). */
    readonly interactive: { readonly 300: string };
    /** Theme accent alias. */
    readonly accent: { readonly 500: string };
  };
  readonly text: {
    readonly default: string;
    readonly subdued: string;
    readonly feedback: {
      readonly success: { readonly default: string };
      readonly error: { readonly default: string };
      readonly warning: { readonly default: string };
    };
  };
}

export type SlotClaim = {
  readonly render: (input: Record<string, any>) => unknown;
} & (
  | {
      readonly append: string;
      readonly prepend?: never;
      readonly before?: never;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly prepend: string;
      readonly append?: never;
      readonly before?: never;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly before: string;
      readonly append?: never;
      readonly prepend?: never;
      readonly after?: never;
      readonly replace?: never;
    }
  | {
      readonly after: string;
      readonly append?: never;
      readonly prepend?: never;
      readonly before?: never;
      readonly replace?: never;
    }
  | {
      readonly replace: string;
      readonly append?: never;
      readonly prepend?: never;
      readonly before?: never;
      readonly after?: never;
    }
);

export interface KeymapCommand {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly group?: string;
  readonly palette?: true;
  readonly slash?: {
    readonly name: string;
    readonly aliases?: readonly string[];
  };
  readonly run: (input?: string) => void | false | Promise<void | false>;
}

export interface Context {
  readonly options: Record<string, any>;
  readonly location: { readonly directory?: string } | undefined;
  readonly theme: Theme;
  readonly storage: {
    store<Value extends object>(
      key: string,
      options: { readonly initial: Value },
    ): readonly [Value, (mutation: (draft: Value) => void) => Promise<void>];
  };
  readonly ui: {
    slot(claim: SlotClaim): () => void;
    readonly toast: {
      show(options: {
        readonly message: string;
        readonly title?: string;
        readonly variant?: string;
        readonly duration?: number;
      }): void;
    };
    readonly dialog: {
      prompt(options: {
        readonly title: string;
        readonly message?: string;
        readonly placeholder?: string;
      }): Promise<string | undefined>;
      select<Value>(options: {
        readonly title: string;
        readonly placeholder?: string;
        readonly options: readonly {
          readonly title: string;
          readonly value: Value;
          readonly description?: string;
          readonly disabled?: boolean;
        }[];
        readonly current?: Value;
      }): Promise<Value | undefined>;
    };
  };
  readonly keymap: {
    layer(
      input: () => {
        readonly mode?: string;
        readonly commands?: readonly KeymapCommand[];
      },
    ): void;
  };
}

export type PluginModule = {
  readonly id: string;
  readonly setup: (
    context: Context,
  ) => void | (() => void) | Promise<void | (() => void)>;
};
