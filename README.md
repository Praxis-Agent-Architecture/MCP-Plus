# MCP Plus

MCP Plus, or MCP+, is an exposure and authoring layer for Model Context Protocol servers.

It is not a new protocol and it is not an MCP replacement. MCP+ keeps the runtime boundary MCP-compatible: hosts still discover tools through standard MCP, models still call standard MCP-shaped tools, and upstream servers can remain ordinary MCP servers.

MCP+ adds a small developer-authored sidecar that tells a wrapper or host adapter how to expose the server more efficiently:

- which tools should stay pinned as full MCP schemas;
- which tools should fold into compact capability cards;
- how folded tools can be expanded back into standard MCP schemas;
- where server-bound skill notes should live;
- how repeated MCP workflows should be remembered and reused.

Think of the first implementation as a wrapper mode for existing MCP servers. A future native/Praxis mode can use the same MCP+ declarations with deeper host control.

## Install

For Node.js and TypeScript MCP servers, install MCP+ as a normal project dependency:

```bash
npm install @praxis-ai/mcp-plus
```

Use this when you want to author MCP+ sidecar manifests, wrapper presets, or host adapters from JavaScript/TypeScript code.

For Python, Go, Rust, Java, or any other non-Node MCP server, you do not need to rewrite the server or add npm to the application itself. Keep the server as a standard MCP server, add an MCP+ manifest or preset, and run it behind an MCP+ wrapper/proxy process. The wrapper talks
to the downstream server through standard MCP and exposes a smaller MCP-compatible surface to the host.

Global installation is only needed once MCP+ ships a first-class CLI. Until then, prefer project-local installation or `npx`-style wrapper usage.

## Why

Large MCP servers can expose many tool schemas at once. In many hosts, those schemas become model-visible context every turn. That creates three practical problems:

- context pressure from full schemas that are rarely used;
- unstable or expensive prompt-cache prefixes when tool surfaces change;
- weak tool-use memory for server-specific workflows.

MCP+ addresses those issues without changing MCP itself. The wrapper keeps common tools visible, folds lower-frequency tools into an index, and provides server-bound skill read/write/finish tools so repeated workflows can become reusable guidance.

## Measured Context Savings

The current wrapper mode has been tested with Codex CLI against real MCP servers: Playwright MCP, Chrome DevTools MCP, and GitHub MCP. The benchmark compares native MCP exposure with MCP+ wrapper exposure on equivalent read-only tasks.

The headline metric is **average model-visible MCP tool layer size per request**. Lower is better: it means fewer full tool schemas are being pushed into the model context each turn.

| MCP setup                             | Task                                                                           | Native tool layer | MCP+ tool layer |     Reduction | Other observed result                                 |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------------: | --------------: | ------------: | ----------------------------------------------------- |
| Playwright MCP                        | Open `example.com` and read the page                                           |      25,656 chars |    16,482 chars | 35.8% smaller | Input tokens dropped 8.3%                             |
| GitHub MCP                            | Read `README.md` and `package.json` from `modelcontextprotocol/typescript-sdk` |      28,792 chars |    19,649 chars | 31.8% smaller | Request body dropped 15.3%; run time dropped 14.8%    |
| Chrome DevTools MCP                   | Open `example.com` and inspect the page                                        |      31,838 chars |    29,940 chars |  6.0% smaller | Input tokens were roughly flat; run time dropped 2.3% |
| Playwright + Chrome DevTools + GitHub | Use all three MCPs in one Codex CLI task                                       |      61,207 chars |    53,866 chars | 12.0% smaller | Cache rate improved from 68.0% to 75.8%               |

These are representative local runs from June 3, 2026, not a universal benchmark. The main thing they show is that MCP+ can reduce the schema-heavy part of the model-visible MCP surface while preserving native MCP tool calls. End-to-end token usage still depends on host behavior
and on whether the wrapper asks the model to use skill or finish tools during the task.

## Relationship To MCP

MCP servers expose three core building blocks:

- tools: model-controlled actions with JSON Schema inputs;
- resources: application-controlled context sources;
- prompts: user-controlled reusable workflow templates.

MCP+ currently focuses on the tool exposure problem because full tool schemas are the biggest prompt-surface cost. The design keeps room for resources and prompts, but wrapper mode should stay conservative: native MCP semantics first, MCP+ metadata second.

## Current Developer Paths

### 1. Wrap An Existing MCP Server

Use this path when you already have an MCP server and want context-efficient exposure without rewriting it.

```bash
pnpm --filter @mcp-plus/example-stdio-proxy exec tsx src/stdio.ts \
  --preset playwright \
  -- npx -y @playwright/mcp@latest
```

For a Codex-style MCP config, the shape is:

```toml
[mcp_servers.playwright-plus]
command = "pnpm"
args = [
  "--dir", "/path/to/mcp-plus",
  "--filter", "@mcp-plus/example-stdio-proxy",
  "exec", "tsx", "src/stdio.ts",
  "--preset", "playwright",
  "--",
  "npx", "-y", "@playwright/mcp@latest"
]
enabled = true
startup_timeout_sec = 120
env = { MCP_PLUS_SKILL_DIR = "/path/to/codex-home/mcp-plus-skills" }
```

The wrapper connects to the downstream MCP server over stdio, calls standard `tools/list`, then exposes a smaller MCP-compatible surface to the host.

### 2. Write An MCP+ Sidecar Manifest

Use this path when you maintain an MCP server and want a better default exposure plan.

TypeScript projects can use `mcp-plus.config.ts`:

```ts
import { defineMcpPlusManifest } from '@praxis-ai/mcp-plus';

export default defineMcpPlusManifest({
    server: {
        id: 'browser',
        title: 'Browser MCP',
        summary: 'Browser automation with folded low-frequency diagnostics.'
    },
    exposure: {
        pinnedTools: ['browser.open', 'page.snapshot'],
        indexedTools: ['network.status'],
        toolCards: {
            'network.status': {
                title: 'Network status',
                summary: 'Inspect network requests only when diagnostics are needed.',
                keywords: ['network', 'requests', '网络请求']
            }
        },
        warmAfterConsecutiveCalls: 2,
        demoteAfterUnusedTurns: 2,
        freezeAfterUnusedTurns: 5
    },
    skills: {
        chapters: [
            {
                id: 'page-inspection',
                title: 'Page inspection',
                summary: 'Open the page, snapshot it, then expand diagnostics only when needed.'
            }
        ]
    }
});
```

Non-TypeScript projects can use `mcp-plus.json`:

```json
{
    "server": {
        "id": "browser",
        "title": "Browser MCP",
        "summary": "Browser automation with folded low-frequency diagnostics."
    },
    "exposure": {
        "pinnedTools": ["browser.open", "page.snapshot"],
        "indexedTools": ["network.status"],
        "toolCards": {
            "network.status": {
                "title": "Network status",
                "summary": "Inspect network requests only when diagnostics are needed.",
                "keywords": ["network", "requests"]
            }
        }
    },
    "skills": {
        "chapters": [
            {
                "id": "page-inspection",
                "title": "Page inspection",
                "summary": "Open the page, snapshot it, then expand diagnostics only when needed."
            }
        ]
    }
}
```

The manifest does not replace the MCP server. It is a sidecar policy layer that can be consumed by a wrapper, gateway, or future Praxis adapter.

### 3. Compile A Native Tool Inventory Into An MCP+ Surface

```ts
import { compileMcpPlusManifest, lowerExposurePlanToMcpSurface, planExposure } from '@praxis-ai/mcp-plus';
import manifest from './mcp-plus.config.js';

const graph = compileMcpPlusManifest(manifest, nativeToolsFromToolsList);
const plan = planExposure(graph, {
    serverId: manifest.server.id,
    mode: 'expanded',
    activeTools: []
});

const surface = lowerExposurePlanToMcpSurface(plan);
```

`surface.tools` remains MCP-compatible. `surface.sidecar` contains compact server, tool, and skill index metadata for MCP+-aware wrappers or host adapters.

## What The Model Sees In Wrapper Mode

Wrapper mode exposes ordinary MCP tools:

- pinned native tools with full schemas;
- `mcp_plus.expand` for activating folded tools;
- `mcp_plus.skill_read` for reading stored server skills;
- `mcp_plus.skill_write` for explicit skill writes;
- `mcp_plus.finish` for finishing a workflow and deciding whether to write a reusable skill card.

The folded indexes are compact. A tool index entry is a capability card, not a full schema:

```ts
type ToolIndexEntry = {
    id: string;
    title: string;
    summary: string;
    activation: {
        serverId: string;
        toolName: string;
    };
    pinned: boolean;
};
```

A skill index entry is also compact. It should help the model decide whether to read the full skill note:

```ts
type SkillIndexEntry = {
    id: string;
    title: string;
    summary: string;
    serverId: string;
    whenToUse?: string;
    why?: string;
    pitfallsPreview?: string[];
};
```

Full skill bodies live in the configured skill store and are read with `mcp_plus.skill_read`.

## Repository Map

- `packages/mcp-plus`: current MCP+ core package, published as `@praxis-ai/mcp-plus`.
- `examples/mcp-plus-browser-style`: minimal manifest and exposure-planning example.
- `examples/mcp-plus-real-server-pilot`: standard MCP stdio discovery pilot using the official MCP client.
- `examples/mcp-plus-stdio-proxy`: wrapper-mode proxy with presets for Playwright, Chrome DevTools, GitHub, and custom TS/JSON manifests.
- `docs/design/mcp-plus-exposure-layer.md`: design notes for wrapper/native modes, indexes, freezing, and measurement.
- `docs/migration-from-mcp.md`: practical guide for adding MCP+ wrapper mode to an existing MCP server.
- `.experiments/codex-mcp-packet`: local benchmark harness. This is intentionally ignored and not part of the package surface.

## Status

This repository is still early. The current working surface is wrapper mode and the exposure planner:

- standard MCP discovery from downstream servers;
- transparent forwarding for non-tool MCP requests and notifications;
- pinned/indexed tool exposure;
- compact tool and skill indexes;
- `mcp_plus.expand`;
- `mcp_plus.finish`-based skill write decisions;
- file-backed per-server skill notes.

The next developer-facing work should be:

- Streamable HTTP and legacy SSE wrapper adapters;
- server-initiated request bridging for sampling, roots, and elicitation;
- CLI sugar for generating a sidecar from an existing MCP `tools/list`;
- docs for native/Praxis mode once the host adapter exists.

## Verification

```bash
pnpm --filter @praxis-ai/mcp-plus test
pnpm --filter @mcp-plus/example-stdio-proxy test
pnpm --filter @mcp-plus/example-stdio-proxy typecheck
```

## Compatibility Promise

MCP+ should always preserve the native MCP shape at the runtime boundary. Standard MCP clients should not need to understand MCP+ metadata for normal tool execution. MCP+ metadata is for wrappers, gateways, and host adapters that want better exposure planning, skill lifecycle,
and context efficiency.
