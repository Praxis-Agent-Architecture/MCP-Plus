import { describe, expect, it } from 'vitest';

import { createJsonRpcHandler } from '../src/jsonRpcServer.js';
import type { ProxyRuntime } from '../src/proxyRuntime.js';

describe('MCP+ proxy JSON-RPC server', () => {
    it('responds to initialize with standard MCP server capabilities', async () => {
        const handle = createJsonRpcHandler(createRuntime());

        const response = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });

        expect(response).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: {
                protocolVersion: '2025-06-18',
                capabilities: {
                    tools: {
                        listChanged: true
                    }
                },
                serverInfo: {
                    name: 'mcp-plus-stdio-proxy',
                    version: '0.0.0'
                }
            }
        });
    });

    it('lists runtime tools in MCP tools/list shape without sidecar fields', async () => {
        const handle = createJsonRpcHandler(createRuntime());

        const response = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

        expect(response).toEqual({
            jsonrpc: '2.0',
            id: 2,
            result: {
                tools: [
                    {
                        name: 'browser_navigate',
                        description: 'Navigate',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ]
            }
        });
    });

    it('routes tools/call to the proxy runtime', async () => {
        const runtime = createRuntime();
        const handle = createJsonRpcHandler(runtime);

        const response = await handle({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'browser_navigate',
                arguments: {
                    url: 'https://example.com'
                }
            }
        });

        expect(response).toEqual({
            jsonrpc: '2.0',
            id: 3,
            result: {
                content: [
                    {
                        type: 'text',
                        text: 'called browser_navigate'
                    }
                ]
            }
        });
    });
});

function createRuntime(): ProxyRuntime {
    return {
        async initialize() {},
        async listTools() {
            return {
                tools: [
                    {
                        name: 'browser_navigate',
                        description: 'Navigate',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ],
                sidecar: {
                    serverCard: {
                        id: 'playwright-plus',
                        title: 'Playwright Plus',
                        summary: 'Folded browser tools.',
                        mode: 'expanded'
                    },
                    toolIndex: [],
                    skillIndex: []
                }
            };
        },
        async callTool(name) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `called ${name}`
                    }
                ]
            };
        }
    };
}
