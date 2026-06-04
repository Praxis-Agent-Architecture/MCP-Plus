# @praxis-ai/mcp-plus

MCP+ is a wrapper-mode exposure and authoring layer for Model Context Protocol servers.

It is not a new protocol and it is not an MCP replacement. MCP+ keeps native MCP server, client, and tool-call shapes intact while helping hosts expose large MCP tool surfaces more efficiently.

## Install

```bash
npm install @praxis-ai/mcp-plus
```

## Write A Manifest

TypeScript projects can use `mcp-plus.config.ts`:

```ts
import { defineMcpPlusManifest } from '@praxis-ai/mcp-plus';

export default defineMcpPlusManifest({
    server: {
        id: 'browser-plus',
        title: 'Browser MCP+',
        summary: 'Browser automation with folded low-frequency diagnostics.'
    },
    exposure: {
        pinnedTools: ['browser.open', 'page.snapshot'],
        indexedTools: ['network.status'],
        toolCards: {
            'network.status': {
                title: 'Network status',
                summary: 'Inspect network requests only when diagnostics are needed.',
                keywords: ['network', 'requests']
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

Other languages can use `mcp-plus.json` with the same manifest shape:

```json
{
    "server": {
        "id": "browser-plus",
        "title": "Browser MCP+",
        "summary": "Browser automation with folded low-frequency diagnostics."
    },
    "exposure": {
        "pinnedTools": ["browser.open", "page.snapshot"],
        "indexedTools": ["network.status"]
    }
}
```

## Compile A Native MCP Tool List

```ts
import { compileMcpPlusManifest, lowerExposurePlanToMcpSurface, planExposure } from '@praxis-ai/mcp-plus';
import manifest from './mcp-plus.config.js';

const graph = compileMcpPlusManifest(manifest, nativeToolsFromMcpToolsList);
const plan = planExposure(graph, {
    serverId: manifest.server.id,
    mode: 'expanded',
    activeTools: []
});

const surface = lowerExposurePlanToMcpSurface(plan);
```

`surface.tools` is still MCP-compatible. `surface.sidecar` contains compact server, tool, and skill index metadata for MCP+-aware wrappers or host adapters.

## Validate A Learned Profile Proposal

`mcp_plus.init` and `mcp_plus.reprofile` are virtual MCP-shaped control tools. The model submits a structured proposal as tool arguments; MCP+ validates and normalizes the proposal; the host decides whether to accept, merge, and persist it.

```ts
import { createInitToolDeclaration, createLearnedProfileFromProposal, mergeMcpPlusPolicy, validateProfileProposal } from '@praxis-ai/mcp-plus';

const initTool = createInitToolDeclaration();
const validation = validateProfileProposal(modelProposal, nativeToolsFromMcpToolsList, {
    serverId: manifest.server.id,
    alwaysIndexTools: manifest.exposure?.alwaysIndexTools
});

if (validation.valid) {
    const learnedProfile = createLearnedProfileFromProposal(modelProposal);
    const effectiveManifest = mergeMcpPlusPolicy({
        manifest,
        learnedProfile,
        runtimeOverlay
    });
}
```

Learned profiles use `schemaVersion: "mcp-plus.profile.v1"`. Runtime exposure mode such as `expanded`, `indexed`, or `frozen` belongs to host-owned runtime overlay, not to the model proposal.

## Core Ideas

- pinned tools keep full native MCP schemas visible;
- indexed tools fold into compact capability cards;
- `mcp_plus.expand` can activate folded tools in wrapper mode;
- `mcp_plus.init` and `mcp_plus.reprofile` define profile proposal contracts without owning runtime storage;
- skill indexes stay compact while full skill notes live in a server-bound skill store;
- `mcp_plus.finish` lets a wrapper ask the model to preserve reusable workflow experience.

## Compatibility

MCP+ metadata is additive. Standard MCP clients should still be able to interact with the underlying MCP server through standard MCP primitives.
