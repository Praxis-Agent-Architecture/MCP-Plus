# Add MCP+ To An Existing MCP Server

This guide shows how to add MCP+ to a normal MCP server without changing the MCP runtime boundary.

MCP+ does not ask you to rewrite your server as a new protocol. Keep your existing MCP server, transports, `tools/list`, and `tools/call` behavior. Add a sidecar manifest that describes how a wrapper or host adapter should expose the server to the model.

## What You Keep

Keep the standard MCP pieces:

- your existing MCP server process;
- your existing stdio or HTTP transport;
- native tool names and native input schemas;
- native tool handlers and results;
- resources and prompts, if your server already exposes them.

MCP+ only changes the exposure layer used by an MCP+ wrapper or host adapter.

## Step 1: Identify Your Core Tools

Split your tools into three groups:

- pinned: small, common tools that should keep full schemas visible;
- indexed: useful but lower-frequency tools that can be folded into compact cards;
- always indexed: tools that should never stay visible as full schemas unless explicitly activated by a host-native adapter.

For a browser server, pinned tools might be navigation, snapshot, click, and fill. Network tracing, performance tracing, screenshots, upload, and console diagnostics can usually start indexed.

## Step 2: Write `mcp-plus.config.ts`

TypeScript projects can use `mcp-plus.config.ts` for type inference:

```ts
import { defineMcpPlusManifest } from '@praxis-ai/mcp-plus';

export default defineMcpPlusManifest({
  server: {
    id: 'my-server-plus',
    title: 'My Server MCP+',
    summary: 'My existing MCP server with folded lower-frequency capabilities.'
  },
  exposure: {
    pinnedTools: ['search', 'read_item'],
    indexedTools: ['create_item', 'delete_item', 'admin_audit_log'],
    toolCards: {
      create_item: {
        title: 'Create item',
        summary: 'Create an item only when the user explicitly asks for a write operation.',
        keywords: ['create', 'write', 'new item']
      },
      admin_audit_log: {
        title: 'Audit log',
        summary: 'Inspect admin audit logs when debugging permission or compliance issues.',
        keywords: ['audit', 'admin', 'permissions']
      }
    },
    warmAfterConsecutiveCalls: 2,
    demoteAfterUnusedTurns: 2,
    freezeAfterUnusedTurns: 5
  },
  skills: {
    chapters: [
      {
        id: 'read-first',
        title: 'Read first',
        summary: 'Inspect existing repository or item state before expanding write tools.'
      }
    ]
  }
});
```

Servers written in Python, Go, Rust, Java, C#, or any other language can use `mcp-plus.json`:

```json
{
  "server": {
    "id": "my-server-plus",
    "title": "My Server MCP+",
    "summary": "My existing MCP server with folded lower-frequency capabilities."
  },
  "exposure": {
    "pinnedTools": ["search", "read_item"],
    "indexedTools": ["create_item", "delete_item", "admin_audit_log"],
    "toolCards": {
      "create_item": {
        "title": "Create item",
        "summary": "Create an item only when the user explicitly asks for a write operation.",
        "keywords": ["create", "write", "new item"]
      }
    }
  },
  "skills": {
    "chapters": [
      {
        "id": "read-first",
        "title": "Read first",
        "summary": "Inspect existing repository or item state before expanding write tools."
      }
    ]
  }
}
```

The manifest should be stable and small. It is not a place for full schemas, long tutorials, or protocol extensions.

## Step 3: Run Through The Wrapper

Point the MCP+ stdio proxy at your existing downstream server:

```bash
pnpm --filter @mcp-plus/example-stdio-proxy exec tsx src/stdio.ts \
  --manifest ./mcp-plus.config.ts \
  -- \
  node ./dist/my-existing-mcp-server.js
```

For non-TypeScript servers, point `--manifest` at `mcp-plus.json` and keep the downstream command in the server's native language:

```bash
pnpm --filter @mcp-plus/example-stdio-proxy exec tsx src/stdio.ts \
  --manifest ./mcp-plus.json \
  -- \
  python -m my_mcp_server
```

For a host config:

```toml
[mcp_servers.my-server-plus]
command = "pnpm"
args = [
  "--dir", "/path/to/mcp-plus",
  "--filter", "@mcp-plus/example-stdio-proxy",
  "exec", "tsx", "src/stdio.ts",
  "--manifest", "/path/to/my-server/mcp-plus.config.ts",
  "--",
  "node", "/path/to/my-server/dist/index.js"
]
enabled = true
startup_timeout_sec = 120
env = { MCP_PLUS_SKILL_DIR = "/path/to/isolated-codex-home/mcp-plus-skills" }
```

The host still sees standard MCP tools. The wrapper decides which native tool schemas stay visible and which stay folded until `mcp_plus.expand` activates them.

All non-tool MCP requests and notifications are forwarded transparently by wrapper mode. `tools/list` and `tools/call` are the only methods with MCP+ behavior: `tools/list` is rewritten according to the exposure plan, and `tools/call` intercepts `mcp_plus.*` control tools while forwarding native tool calls.

## Step 4: Check The Visible Surface

The model-visible wrapper surface should contain:

- pinned native tools with full schemas;
- `mcp_plus.expand`;
- `mcp_plus.skill_read`;
- `mcp_plus.skill_write`;
- `mcp_plus.finish`;
- compact tool and skill index text embedded in the MCP+ control tool descriptions.

It should not contain full schemas for folded indexed tools.

## Step 5: Tune The Manifest

Good tool cards are short and operational:

```ts
toolCards: {
  list_network_requests: {
    title: 'Network requests',
    summary: 'Inspect request URLs, methods, status, and timing when page loading or API behavior matters.',
    keywords: ['network', 'requests', 'api', 'headers']
  }
}
```

Good skill chapters are retrieval hooks, not full instructions:

```ts
skills: {
  chapters: [
    {
      id: 'simple-form',
      title: 'Simple form workflows',
      summary: 'Use snapshots to identify labels and uids, click controls, submit, then read the result.'
    }
  ]
}
```

Full skill notes are written at runtime by `mcp_plus.finish` or `mcp_plus.skill_write`.

## Step 6: Measure

Compare native MCP and MCP+ wrapper mode with the same task:

- success rate;
- number of MCP calls;
- response count;
- model-visible tool schema characters;
- input tokens and cached input tokens if your host exposes them;
- whether useful skill notes are written and later read.

Wrapper mode should reduce persistent full-schema exposure. It may add one or more control calls for simple tasks, so benchmark against real multi-tool workflows and multi-server setups, not only tiny one-shot tasks.

## Publishing Your Server With MCP+

For existing servers, publish your normal MCP package as usual and include:

- `mcp-plus.config.ts` in the repo;
- a README section named `MCP+ wrapper mode`;
- recommended host config snippets;
- a short table of pinned and indexed tools;
- a note that standard MCP clients can still connect directly to the native server.

That gives users a no-risk migration path: native MCP remains the baseline, MCP+ wrapper mode is an optional efficiency layer.
