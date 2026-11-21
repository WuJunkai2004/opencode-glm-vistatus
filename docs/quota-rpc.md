# Multi-provider quota & the `<providerID>.quota` RPC

`opencode-glm-vistatus` renders one quota panel in the OpenCode sidebar. Its
native view is the GLM Coding Plan (z.ai / bigmodel.cn), but the panel is
**multi-provider by design**: any other provider — a sibling plugin like
AtomCode or CodeArts, or a provider plugin of your own, whatever it bridges
into OpenCode (a vendor API, a self-hosted gateway, a third-party service
exposed through your own endpoint) — can feed its quota into the same panel,
live, with **zero changes and zero coupling** on either side.

The only shared surface is the host's plugin-RPC channel plus one snapshot
shape. No plugin imports another; adding a provider = it starts serving an
RPC. Three plugins already integrate this way:

- [`codearts-provider`](https://github.com/WuJunkai2004/codearts-provider) — registers `codearts.quota` (`src/utils/quota-panel.ts`)
- [`opencode-atomcode-provider`](https://github.com/WuJunkai2004/opencode-atomcode-provider) — registers `atomcode.quota`
- `zcode-provider` — registers `zcode.quota`

And this panel is itself a writer: the package ships a `./server` export
(`src/server.ts`) that serves the GLM Coding Plan under the same convention
(`zai-coding-plan.quota`, `zhipuai-coding-plan.quota`, … — one handler per
GLM provider alias), so any reader — including OpenCode Quota — can display
the native GLM quota. Add the package to the **server plugin list**
(`opencode.json[c]`) to expose it; the `cli.json` TUI entry is unaffected
and keeps its own fetch.

> Requirements: OpenCode **≥ v2.0.25** for the host plugin-RPC domain
> (`ctx.rpc.register`). External quota views render on the **V2 TUI host**;
> V1 shows only the native GLM view.

---

## How the multi-provider design works (reader side)

The panel never hardcodes a sibling id. Everything is derived from one
convention:

```
rpcID = <providerID>.quota        // providerID = the OpenCode provider id, lowercased
method = status                   // input: {} (empty object)
```

**Source selection.** While you use the TUI, the panel watches the selected
model's provider (`context.ui.model.current()`). Selecting a provider whose
`<id>.quota` RPC answers → the sidebar swaps its GLM numbers for that
provider's snapshot (header shows the snapshot's `label`). Switch back → GLM
view returns. Data is live: there is no staleness window; the writer owns
freshness (a short server-side cache is recommended, see below).

**Discovery.** The panel learns which providers can serve quota two ways:

1. *Enumeration*: at mount it reads `GET /api/provider` (via the injected
   `client.provider.list()`, which resolves to a **bare array** of
   `{ id, name, models }`) and probes every non-GLM candidate once.
2. *Passive learning*: every snapshot it fetches (e.g. because you selected
   that provider) teaches the panel the id and its `label`.

Providers that ever answered join the **manual switcher**: the sidebar's
platform row becomes a click-to-cycle source switcher
(auto-follow → discovered providers → auto-follow), persisted across
restarts. A provider is only ever probed by convention — this plugin needs
zero configuration and zero knowledge of what "atomcode" or "my-provider" is.

**Polling & failure behavior.** The reader polls the active source every
**30 s**; a failed probe backs off **120 s** per provider; switching targets
probes immediately and synchronously drops the previous target's stale
snapshot. Any malformed output (see limits below) resolves to "no data for
this provider" — the panel degrades, never throws.

**Validation limits** (enforced on the reader; violations → "no data"):

| field       | constraint                        |
| ----------- | --------------------------------- |
| `label`     | non-empty string, ≤ 48 chars      |
| `groups`    | array, 1–8 entries                |
| `title`     | non-empty string, ≤ 48 chars      |
| `bar`       | non-empty string, ≤ 64 chars      |
| `value`     | non-empty string, ≤ 48 chars (label form) |
| `resetTime` | optional number, Unix epoch ms (> 0) |

---

## The snapshot contract (writer side)

From your V2 `setup`, register `<yourProviderID>.quota` with a `status`
method resolving to:

```ts
{
  label: string;                 // shown in the panel header, e.g. "AtomCode"
  groups: Array<
    | { title: string;           // BAR form — a quota window
        bar: string;             // "nn%" OR "xx/yy" — see below
        resetTime?: number; }    // Unix epoch MILLISECONDS — the reader
                                 // renders countdown + clock itself
    | { title: string;           // LABEL form — a metadata row (platform,
        value: string }          // plan level …): right-aligned key/value line
  >;
}
```

Rules that keep the integration seamless:

- **`bar` is a string, and the reader derives everything else.** Use
  `"nn%"` when you only know a percentage, or `"xx/yy"` when you know real
  numbers — the reader parses compact suffixes (`K`/`M`/`B`) and thousands
  separators, derives the fill ratio and the percentage (placed right of
  the bar), and places the `xx/yy` string right of the title. An
  unparseable `bar` renders as a neutral accent with an empty fill —
  it never throws.
- **Label groups** render exactly like the sidebar's native metadata rows
  (right-aligned key/value line, no bar). The reader renders the title
  with a trailing colon (`title:`) — send the bare name, no punctuation.
  They postdate the bar form:
  bar-only readers reject snapshots containing them, so ship label groups
  only when your readers understand the form — for maximum compatibility,
  stick to bars. (This panel's `./server` export uses a label group for its
  plan row and is also the reference reader.)
- **The writer owns i18n for text, the reader owns time.** `title` and
  `value` are display-ready strings the panel prints verbatim.
  `resetTime` is NOT formatted: send Unix epoch milliseconds and the
  reader composes the countdown + clock/day line against its own "now"
  (fresh on every render, in the reader's language).
- **Degrade, don't throw.** Any failure (not logged in, upstream error,
  transport timeout) should resolve `{ label, groups: [] }` — or simply
  reject; either way the panel shows "no data" and the GLM view stays
  available.
- **Be pull-based.** No timer of your own is needed; the panel polls. Do
  keep a short result cache (~30 s, matching the reader's cadence) so
  concurrent TUI sessions don't hammer your upstream. Resolve credentials
  per cache miss so rotated/re-connected credentials are picked up
  automatically.
- **Fire-and-forget registration.** A host without the rpc domain must be
  a safe no-op: `ctx.rpc?.register?.(...)`.

Use the **schema form** — it is the only shape that registers on current
hosts (verified live on v2.3.0: the short form answers `rpc.unavailable`):

```ts
// schema form (atomcode / codearts / opencode-glm-vistatus style)
await ctx.rpc.register(
  {
    id: "my-provider.quota",
    methods: {
      status: {
        input: { type: "object", properties: {}, additionalProperties: false },
        output: { type: "object" },
      },
    },
    events: {},
  },
  { status: async () => snapshot() },
);
```

The short form (`register("my-provider.quota", { status })`) silently
fails to register on hosts ≥ v2.3 — do not use it.

---

## Recipe: expose your own provider's quota

Say you have bridged some upstream into OpenCode as your own provider — a
vendor API served through a self-hosted gateway, a company endpoint, or any
service your plugin exposes — and it is already configured as a provider in
`opencode.jsonc`:

```jsonc
{
  "provider": {
    "my-provider": { /* your provider's models, baseURL, apiKey … */ }
  }
}
```

Your provider almost certainly knows its own usage (a usage endpoint, an
admin API, or accounting state it tracks itself). Exposing that to the
sidebar is a **one-file server plugin** — no fork of this panel, no config:

```ts
// my-provider-quota.ts — add "my-provider-quota" to opencode.jsonc "plugins"
interface Snapshot {
  label: string;
  // resetTime: Unix epoch MILLISECONDS — the reader renders the
  // countdown + clock itself; never send formatted time strings.
  groups: { title: string; bar: string; resetTime?: number }[];
}

export default function setup(ctx: { rpc?: { register?: Function } }) {
  const register = ctx.rpc?.register;
  if (!register) return; // older host → safe no-op

  let cache: { at: number; snap: Snapshot } | null = null;
  const CACHE_MS = 30_000;

  void register("my-provider.quota", {
    // rpcID MUST equal the provider key above + ".quota" — that's the
    // whole convention. The panel derives it from the selected provider.
    status: async (): Promise<Snapshot> => {
      if (cache && Date.now() - cache.at < CACHE_MS) return cache.snap;
      let snap: Snapshot = { label: "My Provider", groups: [] };
      try {
        const res = await fetch("https://gateway.example.com/usage", {
          headers: { authorization: process.env.MY_PROVIDER_TOKEN ?? "" },
          signal: AbortSignal.timeout(5000),
        });
        const u = await res.json(); // { used, limit, resetAt } — your shape
        snap = {
          label: "My Provider",
          groups: [{
            title: "5h",
            bar: `${u.used}/${u.limit}`, // "12.4K/200K" — reader derives %
            resetTime: u.resetAt, // epoch ms — reader renders the line
          }],
        };
      } catch {
        // degrade to "no data" — never throw past the RPC boundary
      }
      cache = { at: Date.now(), snap };
      return snap;
    },
  });
}
```

That's it. After a restart:

1. Select a `my-provider` model → the sidebar shows its quota in place of
   the GLM numbers.
2. The provider joins the switcher cycle — click the platform row to cycle
   auto-follow → `My Provider` → auto-follow; the choice persists.
3. When your provider's upstream is down, a pinned view shows an explicit
   "offline" hint instead of silently falling back to GLM numbers.

The same recipe covers every other kind of provider plugin: a full provider
package (AtomCode-style: provider + models + quota RPC in one `./server`
export) or a quota-only sidecar plugin like the example above.

---

## Debugging

The core RPC service is exposed to clients at
`POST /api/rpc/<rpcID>/<method>`, so a running server answers directly —
note the input envelope (`{"input":{}}`; a bare `{}` fails validation),
or just use the CLI, which handles authentication for you:

```sh
opencode api POST /api/rpc/my-provider.quota/status --data '{"input":{}}'
```

Return well-formed JSON as above and the panel picks it up on its next
probe. An empty `groups` array is valid (renders "no data"); malformed
shapes are rejected client-side.
