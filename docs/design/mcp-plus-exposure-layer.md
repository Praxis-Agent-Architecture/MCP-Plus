# MCP+ Exposure Layer

MCP+ is a host-side exposure enhancement layer for MCP. It does not replace MCP, define a new wire protocol, or require existing MCP servers to rewrite their core runtime. MCP+ keeps native MCP server, client, and tool-call shapes intact while improving how a host exposes MCP tools to the model.

The first phase focuses on context efficiency and tool-use proficiency:

- reduce persistent tool-schema pressure in the model context;
- keep the stable cache head smaller and more deterministic;
- expose full native MCP tool schemas only when they are pinned or active;
- keep folded tools discoverable through compact capability cards;
- bind searchable skill guidance to each server so repeated MCP workflows become easier for the model to perform.

## Non-Goals

MCP+ does not introduce an MCP+ protocol, replace `tools/list` or `tools/call`, or require a standard MCP client to understand MCP+ metadata. In native mode, existing MCP clients and servers continue to work as they do today.

MCP+ also does not assume every host can control arbitrary non-MCP prompt sections. The core design must work when the only reliable surface is the MCP tool block. Full prompt assembly control is an optional host-adapter enhancement.

## Modes

### Native MCP Mode

MCP+ does not intervene. The host connects to one or more MCP servers and exposes their tools using the host's normal behavior. This mode is the compatibility baseline and the benchmark control.

### MCP+ Wrapper / Proxy Mode

The wrapper connects to real MCP servers, reads their full `tools/list`, and exposes a smaller MCP-shaped surface to the host:

- native MCP tool schemas selected as pinned or active;
- compact server cards;
- compact tool index entries, also called capability cards;
- compact skill index entries;
- pinned MCP+ control tools such as `mcp_plus.expand`.

The wrapper performs folding, unpinning, thawing, `indexed -> active` schema promotion, and `frozen -> expanded` server promotion within the MCP block. The host still sees ordinary MCP tools and calls ordinary MCP tools.

### MCP+ Full Host Adapter Mode

A host adapter, such as a Praxis adapter, can control prompt assembly outside the MCP block. This mode can split content into a stable cache head, volatile active tool layer, skill chapters, observability metadata, and normal conversation tail.

This is the complete form of MCP+, but phase one must not depend on it.

## Core Concepts

### Sidecar Manifest

Existing MCP servers can add an MCP+ sidecar manifest without changing their native MCP implementation. The manifest declares exposure policy and skill layout:

- pinned tools;
- indexed-only tools;
- warm-tool promotion rules;
- demotion and freeze rules;
- compact schema and description rules;
- server and tool capability-card text;
- skill storage and skill chapter organization.

### Exposure Policy

`ExposurePolicy` is developer-authored. It describes the intended exposure behavior for a server or server group. It is declarative and stable enough to participate in the cache head.

### Exposure State

`ExposureState` is host-maintained. It records recent tool calls, semantic expansion requests, active tools, frozen servers, warm tools, and skill chapter usage. It changes across turns and should not be treated as part of the stable cache contract.

### Exposure Planner

`ExposurePlanner` combines policy, state, current server inventory, and the latest expansion requests into an `ExposurePlan`. The plan is the per-turn result that says which MCP content is model-visible.

### Tool Index

`ToolIndex` contains compact capability cards, not full input schemas. A card should be stable, deterministic, and small. It tells the model what a folded capability can do and gives the wrapper enough identity to activate the native MCP tool schema later.

### Skill Index

`SkillIndex` is a compact table of server-bound skill chapters. The actual skill body is searchable and expandable. It records successful workflows, failure corrections, and reusable recipes for a specific MCP server without putting the whole skill book into the prompt.

### MCP+ Expand Tool

`mcp_plus.expand` is a pinned native MCP control tool exposed by the wrapper. It lets the model ask the wrapper to activate folded tools, thaw a frozen server, or expand relevant skill guidance.

The tool should remain tiny. The MVP shape is:

```json
{
  "server": "chrome-devtools",
  "request": "查看网页状态"
}
```

The expand result should not dump full schemas into normal text. Instead, it should update wrapper exposure state and return a concise activation summary. The next model turn receives the selected native MCP tool schemas through the normal MCP tool surface.

## Exposure Lifecycle

MCP+ tracks four broad exposure states:

- `pinned`: native MCP tool schemas always remain visible while the server is expanded;
- `warm`: native MCP tool schemas remain visible because recent usage indicates they are useful now;
- `indexed`: tools are folded into compact capability cards and can be activated by `mcp_plus.expand`;
- `frozen`: the whole server is folded back to a minimal server card and index entry.

Freezing is server-level. A frozen server does not keep persistent tool schemas or expanded skill chapters in the MCP block. One later expansion may destabilize the active tool layer, but the tradeoff is a smaller stable prefix and a larger available context window during inactive periods.

Default lifecycle rules should be conservative:

- promote indexed tools to warm after repeated direct use or expansion requests;
- demote warm tools after repeated non-use;
- freeze an expanded server after repeated relevant opportunities where the model chooses another method or does not use the server;
- thaw a frozen server when `mcp_plus.expand` or host intent detection points back to it.

Developers can override thresholds in the sidecar manifest.

## Prompt Shape

In wrapper mode, MCP+ only assumes control of the MCP block:

```text
<mcp section>
  global MCP+ exposure instruction

  server card
  pinned native MCP tool schemas
  compact tool index
  compact skill index

  mcp_plus.expand schema
  global MCP skill read/write instruction
</mcp section>
```

Full host adapter mode can place these pieces into separate prompt/cache regions, but wrapper mode must remain useful without that control.

## Compatibility Requirements

The wrapper must preserve native MCP semantics:

- upstream servers are discovered through standard MCP;
- active calls execute through native MCP tool calls;
- standard clients see legal MCP tools;
- MCP+ metadata is additive and ignored by clients that do not understand it;
- tool-index entries do not replace native input schemas for active tools.

## Phase One Deliverables

Phase one should produce:

- a sidecar manifest type and helper API;
- `ExposurePolicy`, `ExposureState`, `ExposurePlanner`, `ExposurePlan`;
- `ToolIndex` and `SkillIndex` models;
- a minimal `mcp_plus.expand` declaration;
- compile functions from manifest and server inventory into an exposure graph;
- lowering from an exposure graph and state into an MCP-compatible visible shape;
- a hello or browser-style example showing pinned, indexed, active, and frozen behavior;
- tests that compare native full exposure with MCP+ folded exposure.

The initial package keeps these pieces in `@mcp-plus/core` until the boundaries are stable enough to split into smaller publishable packages.

## Real Server Pilot

The wrapper/proxy path must be proven against standard MCP discovery, not only handwritten arrays. The pilot shape is:

```text
stdio MCP server
  -> official MCP client
  -> tools/list
  -> native tool declarations
  -> MCP+ exposure graph
  -> folded MCP-compatible surface
```

The pilot can run against a local fixture server for tests or against installed servers such as Playwright MCP by changing the stdio command. The important invariant is that upstream discovery remains standard MCP and downstream visible tools remain native MCP tool declarations.

## Measurement

MCP+ should be judged by measurable behavior:

- model-visible tool-schema token size;
- stable cache head size and deterministic ordering;
- number of active schemas per turn;
- number of turns needed for indexed or frozen capability activation;
- success rate and tool-call count for repeated MCP workflows;
- skill chapter growth and retrieval precision.

The first estimator is deliberately simple: it compares full native `tools/list` schema characters with the currently visible MCP+ schema characters plus stable tool-index characters, counts folded index entries, and records the expected activation turns for indexed tools. Later benchmark work should replace character counts with tokenizer-specific measurements and live provider cache telemetry.
