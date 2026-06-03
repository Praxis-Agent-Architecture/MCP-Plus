# MCP+

MCP+ is a host-side exposure enhancement layer for MCP. It keeps native MCP server, client, and tool-call shapes intact while improving how a host exposes MCP tools to the model.

MCP+ is not a new protocol and is not an MCP replacement. A standard MCP client should still see standard MCP tools. MCP+ adds a sidecar manifest and wrapper/host policy layer that decides which native MCP schemas stay visible, which capabilities fold into compact index cards,
and when folded or frozen servers should be expanded again.

## First-Phase Shape

- `McpPlusManifest` describes a server card, exposure policy, and skill chapters.
- `compileMcpPlusManifest(...)` combines sidecar policy with native MCP `tools/list` output.
- `planExposure(...)` produces a per-turn exposure plan from graph plus runtime state.
- `lowerExposurePlanToMcpSurface(...)` returns native visible tools plus MCP+ sidecar metadata.
- `mcp_plus.expand` is the tiny pinned control tool that asks the wrapper to activate folded tools or skill guidance.
- `McpPlusWrapperRuntime` is a minimal in-memory wrapper runtime for planning and expansion experiments.

Tool indexes contain compact capability cards only. Full native input schemas appear only for pinned, warm, or active tools. Developers can add stable card titles, summaries, and keywords in the sidecar manifest so natural-language expand requests map to folded native tools
without putting full schemas in the index.
