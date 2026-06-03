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
                    resources: {
                        listChanged: true
                    },
                    prompts: {},
                    logging: {},
                    completions: {},
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

    it('transparently forwards non-tool MCP requests to the downstream server', async () => {
        const runtime = createRuntime();
        const handle = createJsonRpcHandler(runtime);

        const resources = await handle({ jsonrpc: '2.0', id: 4, method: 'resources/list', params: { cursor: 'a' } });
        const read = await handle({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'file:///a.txt' } });
        const prompts = await handle({ jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'review' } });
        const logging = await handle({ jsonrpc: '2.0', id: 7, method: 'logging/setLevel', params: { level: 'debug' } });
        const completion = await handle({
            jsonrpc: '2.0',
            id: 8,
            method: 'completion/complete',
            params: {
                ref: { type: 'ref/prompt', name: 'review' },
                argument: { name: 'focus', value: 'sec' }
            }
        });
        const resourceTemplates = await handle({ jsonrpc: '2.0', id: 9, method: 'resources/templates/list' });
        const promptList = await handle({ jsonrpc: '2.0', id: 10, method: 'prompts/list' });

        expect(resources).toEqual({
            jsonrpc: '2.0',
            id: 4,
            result: { forwarded: 'resources/list', params: { cursor: 'a' } }
        });
        expect(read).toEqual({
            jsonrpc: '2.0',
            id: 5,
            result: { forwarded: 'resources/read', params: { uri: 'file:///a.txt' } }
        });
        expect(prompts).toEqual({
            jsonrpc: '2.0',
            id: 6,
            result: { forwarded: 'prompts/get', params: { name: 'review' } }
        });
        expect(logging).toEqual({
            jsonrpc: '2.0',
            id: 7,
            result: { forwarded: 'logging/setLevel', params: { level: 'debug' } }
        });
        expect(completion).toEqual({
            jsonrpc: '2.0',
            id: 8,
            result: {
                forwarded: 'completion/complete',
                params: {
                    ref: { type: 'ref/prompt', name: 'review' },
                    argument: { name: 'focus', value: 'sec' }
                }
            }
        });
        expect(resourceTemplates).toEqual({
            jsonrpc: '2.0',
            id: 9,
            result: { forwarded: 'resources/templates/list', params: undefined }
        });
        expect(promptList).toEqual({
            jsonrpc: '2.0',
            id: 10,
            result: { forwarded: 'prompts/list', params: undefined }
        });
        expect(runtime.forwardedRequests).toEqual([
            { method: 'resources/list', params: { cursor: 'a' } },
            { method: 'resources/read', params: { uri: 'file:///a.txt' } },
            { method: 'prompts/get', params: { name: 'review' } },
            { method: 'logging/setLevel', params: { level: 'debug' } },
            {
                method: 'completion/complete',
                params: {
                    ref: { type: 'ref/prompt', name: 'review' },
                    argument: { name: 'focus', value: 'sec' }
                }
            },
            { method: 'resources/templates/list', params: undefined },
            { method: 'prompts/list', params: undefined }
        ]);
    });

    it('transparently forwards client notifications without returning a response', async () => {
        const runtime = createRuntime();
        const handle = createJsonRpcHandler(runtime);

        const response = await handle({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {}
        });

        expect(response).toBeUndefined();
        expect(runtime.forwardedNotifications).toEqual([{ method: 'notifications/initialized', params: {} }]);
    });
});

function createRuntime(): ProxyRuntime & {
    forwardedRequests: Array<{ method: string; params?: unknown }>;
    forwardedNotifications: Array<{ method: string; params?: unknown }>;
} {
    const forwardedRequests: Array<{ method: string; params?: unknown }> = [];
    const forwardedNotifications: Array<{ method: string; params?: unknown }> = [];

    return {
        forwardedRequests,
        forwardedNotifications,
        async initialize() {
            return {
                protocolVersion: '2025-06-18',
                capabilities: {
                    resources: {
                        listChanged: true
                    },
                    prompts: {},
                    logging: {},
                    completions: {},
                    tools: {
                        listChanged: true
                    }
                },
                serverInfo: {
                    name: 'mcp-plus-stdio-proxy',
                    version: '0.0.0'
                }
            };
        },
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
        },
        async forwardRequest(method, params) {
            forwardedRequests.push({ method, params });
            return { forwarded: method, params };
        },
        async forwardNotification(method, params) {
            forwardedNotifications.push({ method, params });
        }
    };
}
