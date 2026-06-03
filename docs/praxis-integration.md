# MCP+ Praxis Integration Notes

This document is the technical handoff for connecting MCP+ to Praxis native runtime.

MCP+ must remain an exposure and authoring layer for standard Model Context Protocol servers. Praxis can provide the native host/runtime control that wrapper mode cannot provide in ordinary MCP hosts.

## Goals

- Keep downstream servers standard MCP-compatible.
- Load MCP+ manifests as sidecar exposure policy, not as a protocol replacement.
- Preserve normal MCP tool/resource/prompt semantics at the boundary.
- Let Praxis own dynamic exposure, skill lifecycle, approval, sandbox, and observability.
- Make non-Node MCP servers usable through wrapper/proxy or manifest-driven mounting.

## Current Package Surface

The published package is:

```bash
npm install @praxis-ai/mcp-plus
```

Current exported API lives in `packages/mcp-plus/src/index.ts`:

- `defineMcpPlusManifest(manifest)`
- `compileMcpPlusManifest(manifest, nativeTools)`
- `planExposure(graph, state)`
- `lowerExposurePlanToMcpSurface(plan)`
- `estimateExposurePlanImpact(graph, plan)`
- `ExposurePlanner`
- `McpPlusWrapperRuntime`

The package is TypeScript/Node-first. Praxis can import it directly when the adapter is implemented in TS. Other language MCP servers should be treated as downstream standard MCP servers and mounted through a Praxis-side proxy/adapter.

## Core Data Model

### Manifest

`McpPlusManifest` is the developer-authored sidecar:

```ts
type McpPlusManifest = {
    server: {
        id: string;
        title?: string;
        summary: string;
    };
    exposure?: {
        pinnedTools?: string[];
        warmTools?: string[];
        indexedTools?: string[];
        alwaysIndexTools?: string[];
        toolCards?: Record<string, ToolCardPolicy>;
        freezeAfterUnusedTurns?: number;
        warmAfterConsecutiveCalls?: number;
        demoteAfterUnusedTurns?: number;
    };
    skills?: {
        storage?: string;
        chapters?: Array<{
            id: string;
            title: string;
            summary: string;
        }>;
    };
};
```

Praxis should treat this as declarative policy:

- `pinnedTools`: always model-visible as full schemas while the server is expanded.
- `warmTools`: visible by default, but eligible for demotion according to runtime policy.
- `indexedTools`: represented by compact tool cards until activated.
- `alwaysIndexTools`: never exposed as full schema unless called through an explicit activation path.
- `toolCards`: stable compact capability cards for folded tools.
- `skills.chapters`: initial server-bound skill index chapters.

### Graph

`compileMcpPlusManifest(manifest, nativeTools)` produces an `ExposureGraph`.

Inputs:

- `manifest`: MCP+ sidecar policy.
- `nativeTools`: standard MCP `tools/list` result normalized to `{ name, description, inputSchema }`.

Output:

- sorted native tools;
- pinned/warm/indexed/always-index sets;
- compact skill index entries;
- lifecycle thresholds.

Praxis should compile this once per server discovery cycle, then keep graph and runtime state separate.

### State

`ExposureState` is the runtime decision:

```ts
type ExposureState = {
    serverId: string;
    mode: 'expanded' | 'indexed' | 'frozen';
    activeTools?: string[];
};
```

Meaning:

- `expanded`: expose pinned, warm, and active tools as full schemas.
- `indexed`: expose only the MCP+ control surface plus compact tool/skill indexes.
- `frozen`: collapse the whole MCP server to the smallest wake-up surface.

Wrapper mode can only approximate this because host tool schemas are usually fixed per request/turn. Praxis native mode should own this state and refresh model-visible tools at harness boundaries.

### Plan And Surface

`planExposure(graph, state)` returns:

- `serverCard`: compact server summary and current mode.
- `visibleTools`: standard MCP-shaped tool declarations for the current state.
- `toolIndex`: compact folded capability cards.
- `skillIndex`: compact skill cards.

`lowerExposurePlanToMcpSurface(plan)` returns:

```ts
type McpCompatibleSurface = {
    tools: NativeToolDeclaration[];
    sidecar: {
        serverCard: ServerCard;
        toolIndex: ToolIndexEntry[];
        skillIndex: SkillIndexEntry[];
    };
};
```

`tools` is what ordinary MCP hosts can see. `sidecar` is for MCP+-aware wrappers, gateways, and Praxis.

## Praxis Native Adapter Shape

Recommended mount flow:

```ts
import { compileMcpPlusManifest, lowerExposurePlanToMcpSurface, planExposure, type McpPlusManifest } from '@praxis-ai/mcp-plus';

export async function mountMcpPlusServer(options: {
    serverId: string;
    manifest: McpPlusManifest;
    downstream: StandardMcpClient;
    registry: PraxisCapabilityRegistry;
    exposureState: PraxisExposureStateStore;
    skills: PraxisSkillStore;
    policy: PraxisPolicyEngine;
    telemetry: PraxisTelemetry;
    sessionId: string;
}) {
    const nativeTools = await options.downstream.listTools();
    const graph = compileMcpPlusManifest(options.manifest, nativeTools);
    const state = (await options.exposureState.load(options.serverId, options.sessionId)) ?? {
        serverId: options.serverId,
        mode: 'expanded'
    };

    const plan = planExposure(graph, state);
    const surface = lowerExposurePlanToMcpSurface(plan);

    await options.registry.mountMcpTools({
        serverId: options.serverId,
        tools: surface.tools,
        metadata: surface.sidecar
    });
}
```

Praxis should provide the host-side ports below.

### StandardMcpClient

Minimum needed:

```ts
type StandardMcpClient = {
    listTools(): Promise<NativeToolDeclaration[]>;
    callTool(name: string, args: unknown): Promise<unknown>;
    listResources?(): Promise<unknown>;
    readResource?(uri: string): Promise<unknown>;
    listPrompts?(): Promise<unknown>;
    getPrompt?(name: string, args?: unknown): Promise<unknown>;
};
```

Tool exposure is the first MCP+ target. Resources and prompts should pass through unchanged until MCP+ has explicit resource/prompt exposure policy.

### PraxisCapabilityRegistry

Needs to support dynamic replacement at harness boundaries:

```ts
type PraxisCapabilityRegistry = {
    mountMcpTools(input: { serverId: string; tools: NativeToolDeclaration[]; metadata: McpPlusSidecar }): Promise<void>;
    updateMcpTools(input: { serverId: string; tools: NativeToolDeclaration[]; metadata: McpPlusSidecar; reason: string }): Promise<void>;
};
```

This is the key difference from wrapper mode. Praxis can actually re-render the model-visible tool layer after activation, demotion, or freezing.

### PraxisExposureStateStore

Praxis should persist state per server and session:

```ts
type PraxisExposureStateStore = {
    load(serverId: string, sessionId: string): Promise<ExposureState | undefined>;
    save(serverId: string, sessionId: string, state: ExposureState): Promise<void>;
};
```

Recommended counters:

- consecutive calls per tool;
- unused turns per tool;
- unused turns per server;
- last activation reason;
- last schema refresh time.

Suggested default transitions:

- `indexed` to `expanded`: explicit expansion request or successful activation card match.
- warm promotion: same indexed tool called for `warmAfterConsecutiveCalls` consecutive opportunities.
- warm demotion: warm/active tool unused for `demoteAfterUnusedTurns`.
- server freeze: server unused for `freezeAfterUnusedTurns`.
- frozen wake-up: task semantically targets the server, explicit expansion, or tool call request.

### PraxisSkillStore

Wrapper mode currently stores skill notes through `mcp_plus.skill_read`, `mcp_plus.skill_write`, and `mcp_plus.finish`. In Praxis native mode, the runtime should own this lifecycle instead of relying only on model initiative.

```ts
type PraxisSkillStore = {
    list(serverId: string): Promise<SkillNote[]>;
    read(serverId: string, query: { chapter?: string; id?: string }): Promise<SkillNote[]>;
    write(serverId: string, note: SkillWriteInput): Promise<SkillNote>;
    summarizeAfterToolWorkflow?(input: { serverId: string; transcript: unknown; toolCalls: Array<{ name: string; args: unknown; result: unknown }>; outcome: 'success' | 'failure' | 'partial' }): Promise<SkillWriteInput | undefined>;
};
```

Recommended skill note shape:

```yaml
chapter: browser-quiz
title: Answer simple forms with browser snapshots
summary: Use accessibility snapshots to read labels and stable-enough element ids before clicking.
whenToUse: Simple form, quiz, and page-state tasks in browser MCP servers.
do:
    - Navigate or open the target page.
    - Take an accessibility snapshot before interacting.
    - Click controls by current uid.
    - Submit with a returned snapshot when available.
    - Read the updated page state before declaring success.
why: Snapshots expose semantic labels and ids more reliably than screenshot guessing.
pitfalls:
    - Element ids may change after navigation or DOM updates.
    - Screenshots are weaker for form state and labels.
    - Do not assume submission succeeded; read the returned state.
```

Praxis should inject compact skill cards into the MCP+ block, and only load full skill bodies when the model or runtime selects a relevant chapter.

## Wrapper Mode vs Praxis Native Mode

### Wrapper Mode

Works with existing hosts such as Codex CLI or Claude Code.

Can do:

- expose fewer full schemas;
- include compact tool and skill indexes in control tool descriptions;
- provide `mcp_plus.expand`;
- provide `mcp_plus.skill_read`;
- provide `mcp_plus.skill_write`;
- provide `mcp_plus.finish`;
- proxy downstream standard MCP tool calls.

Cannot guarantee:

- same-turn dynamic tool schema refresh;
- forced model skill writing;
- host-level prompt section placement outside the MCP block;
- fully automatic frozen/warm/pinned transitions.

### Praxis Native Mode

Praxis can do the complete design because it owns the harness:

- dynamically update model-visible schemas at turn/harness boundaries;
- manage exposure counters without asking the model;
- freeze whole servers when unused;
- thaw servers from task intent, expansion requests, or runtime routing;
- summarize skills after successful or failed workflows;
- place MCP+ metadata in stable prompt sections;
- connect policy, approval, sandbox, and observability to each capability.

## Prompt/Context Layout For Praxis

Recommended MCP+ block:

```text
<mcp-plus>
Global MCP+ instruction: standard MCP tools remain the runtime boundary. Use indexes to expand only when needed.

Server: playwright
Summary: Browser automation through Playwright MCP.
Mode: expanded | indexed | frozen
Pinned tools:
- browser_open: ...
- page_snapshot: ...
Tool index:
- network_status: Inspect network requests when diagnostics are needed.
Skill index:
- browser-quiz: Use snapshots to answer simple web forms.

Server: github
...

Skill lifecycle instruction:
When a reusable MCP workflow succeeds or exposes a pitfall, preserve it as a concise skill note.
</mcp-plus>
```

For ordinary MCP hosts, this must be encoded through tool descriptions/control tools. For Praxis, it should be a first-class prompt segment owned by the harness.

## Policy, Sandbox, And Observability

MCP+ currently records exposure and skill metadata. Praxis should enrich it with:

- risk level;
- approval policy;
- sandbox requirement;
- network policy;
- secret dependency;
- audit requirement;
- telemetry labels.

Suggested metadata join key:

```ts
{
    serverId: manifest.server.id,
    toolName: nativeTool.name
}
```

Do not put Praxis-only policy into standard MCP schemas unless it is compatible with ordinary MCP clients. Keep Praxis-specific fields in sidecar metadata or Praxis runtime state.

## Compatibility Rules

- Downstream MCP servers should not need to know MCP+ exists.
- Standard MCP clients should still see standard MCP-shaped tools.
- MCP+ control tools must use ordinary MCP tool schemas.
- Resources, prompts, logging, progress, cancellation, roots, sampling, elicitation, auth, and session lifecycle should pass through unchanged until explicit MCP+ behavior is implemented and tested.
- If a Praxis adapter changes exposure, it should do so at a harness boundary where the model-visible tool list can be rebuilt coherently.

## Suggested Implementation Phases

### Phase 1: Native Mount Skeleton

- Implement `mountMcpPlusServer`.
- Discover downstream tools through standard MCP.
- Load manifest from TS/JSON.
- Compile graph and expose initial `expanded` or `indexed` surface.
- Preserve direct downstream `tools/call`.

### Phase 2: Dynamic Exposure State

- Add persistent `ExposureStateStore`.
- Track tool calls and unused turns.
- Implement warm promotion, demotion, and server freeze.
- Rebuild Praxis tool registry at harness boundaries.

### Phase 3: Skill Lifecycle

- Mount `skill_read`, `skill_write`, and `finish` equivalents as native Praxis operations.
- Add runtime-driven workflow summarization after complex MCP tool sequences.
- Inject compact skill cards into the MCP+ prompt segment.
- Load full skill bodies only on demand.

### Phase 4: Policy And Sandbox

- Join MCP+ tool metadata to Praxis policy.
- Route risky tools through approval.
- Route sandbox-required tools through RaxBox/Raxcell.
- Emit audit and trace events for exposure transitions and tool calls.

### Phase 5: Broader MCP Semantics

- Pass through resources/prompts fully.
- Add tests for Streamable HTTP, SSE, notifications, progress, cancellation, roots, sampling, elicitation, and auth behavior.
- Only add MCP+ metadata for these surfaces after pass-through parity is stable.

## Acceptance Tests For Praxis

Minimum tests before calling the adapter complete:

- A standard MCP server mounts with no manifest and behaves like native MCP.
- A manifest pins one tool and indexes another; Praxis exposes only the pinned full schema initially.
- An indexed tool activation expands the matching full schema at the next harness boundary.
- Repeated indexed tool use promotes it to warm state.
- Unused warm tools demote back to index.
- An unused server freezes after the configured threshold.
- Frozen server wakes when task intent or expansion targets it.
- Skill note written after a browser workflow appears in the next skill index.
- Full skill body is not injected unless selected/read.
- Resources and prompts pass through unchanged.
- Tool calls still reach the downstream standard MCP server with original names and arguments.

## Open Questions For Praxis

- What exact boundary can safely refresh model-visible tools: every turn, every subtask, or only session checkpoints?
- Should tool expansion be model-requested, runtime-inferred, or both?
- Where should skill summarization run: post-tool-call hook, finish hook, or end-of-task hook?
- How should exposure state persist across sessions: user-level, workspace-level, server-level, or project-level?
- Which Praxis policy fields should be standardized in MCP+ manifests versus kept Praxis-only?
