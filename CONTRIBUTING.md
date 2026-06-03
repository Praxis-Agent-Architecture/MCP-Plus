# Contributing to MCP Plus

Thanks for helping improve MCP Plus.

MCP+ is an exposure and authoring layer for Model Context Protocol servers. It is not a new protocol and it is not an MCP replacement. Contributions should preserve standard MCP compatibility: downstream servers remain standard MCP servers, and hosts still receive standard
MCP-shaped tools, resources, prompts, and server capabilities.

## What Belongs Here

Good contribution areas include:

- wrapper/proxy behavior for existing MCP servers;
- MCP+ sidecar manifests and exposure plans;
- tool index, skill index, finish, and schema-folding behavior;
- compatibility tests against standard MCP servers;
- documentation and examples for Node and non-Node MCP servers;
- future Praxis/native host adapter work.

Changes that would make MCP+ an incompatible protocol fork should be discussed first and will usually be rejected.

## Before Opening A PR

For small fixes, documentation edits, or focused tests, a pull request is fine.

For larger changes, please open an issue first so we can align on:

- the MCP compatibility boundary;
- whether the change belongs in wrapper mode, native/Praxis mode, or both;
- how the behavior should degrade for ordinary MCP hosts;
- what tests or examples should prove the change.

## Development

This repository uses pnpm:

```bash
corepack enable
pnpm install
```

Useful checks:

```bash
pnpm --filter @praxis-ai/mcp-plus typecheck
pnpm --filter @praxis-ai/mcp-plus test
pnpm --filter @praxis-ai/mcp-plus lint
pnpm run typecheck:all
pnpm run build:all
pnpm run lint:all
```

The root workspace still contains MCP TypeScript SDK packages used for compatibility and wrapper development. Prefer keeping MCP+ product changes scoped to `packages/mcp-plus`, MCP+ examples, tests, and docs unless a broader compatibility change is intentional.

## Pull Request Checklist

- Keep MCP-compatible output intact.
- Add or update tests for behavior changes.
- Update README or examples when developer-facing behavior changes.
- Keep public docs clear that MCP+ is an authoring/exposure layer, not a protocol replacement.
- Avoid committing generated caches, local experiment runs, secrets, or auth files.

## Code Of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
