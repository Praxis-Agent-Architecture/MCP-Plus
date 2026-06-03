# MCP+ Real Server Pilot

This example proves the wrapper/proxy path against a real stdio MCP connection. The test starts a tiny MCP-compatible stdio server, reads its native `tools/list` through the official SDK client, and folds the inventory through MCP+ exposure planning.

The same `runStdioMcpPlusPilot(...)` helper can be pointed at an installed server command:

```ts
await runStdioMcpPlusPilot({
    command: 'npx',
    args: ['@playwright/mcp@latest'],
    manifest: createBrowserPilotManifest()
});
```

The result includes:

- native tool names from standard MCP discovery;
- the visible MCP+ wrapper surface;
- compact sidecar index metadata;
- an impact estimate for full-schema versus folded exposure size and indexed activation turns.
