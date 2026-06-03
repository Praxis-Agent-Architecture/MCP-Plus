import { describe, expect, it } from 'vitest';

import { createProxyRuntime, type DownstreamMcpClient } from '../src/proxyRuntime.js';
import { createMemorySkillStore } from '../src/skillStore.js';
import type { NativeToolDeclaration } from '@mcp-plus/core';

const nativeTools: NativeToolDeclaration[] = [
    {
        name: 'browser_navigate',
        description: 'Navigate to a URL',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' }
            },
            required: ['url'],
            additionalProperties: false
        }
    },
    {
        name: 'browser_snapshot',
        description: 'Capture an accessibility snapshot',
        inputSchema: {
            type: 'object',
            properties: {
                depth: { type: 'number' }
            },
            additionalProperties: false
        }
    },
    {
        name: 'browser_network_requests',
        description: 'List network requests for the current page',
        inputSchema: {
            type: 'object',
            properties: {
                includeHeaders: { type: 'boolean' }
            },
            additionalProperties: false
        }
    }
];

describe('MCP+ stdio proxy runtime', () => {
    it('lists only pinned tools plus expand and folds indexed tools', async () => {
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate', 'browser_snapshot'],
                    indexedTools: ['browser_network_requests'],
                    toolCards: {
                        browser_network_requests: {
                            summary: 'Inspect network requests only when diagnostics are needed.',
                            keywords: ['network', 'requests', '网络请求']
                        }
                    }
                }
            },
            downstream: createDownstreamClient()
        });

        await runtime.initialize();

        const listed = await runtime.listTools();

        expect(listed.tools.map(tool => tool.name)).toEqual([
            'browser_navigate',
            'browser_snapshot',
            'mcp_plus.expand',
            'mcp_plus.skill_read',
            'mcp_plus.skill_write'
        ]);
        expect(JSON.stringify(listed.tools)).not.toContain('includeHeaders');
        expect(listed.sidecar.toolIndex).toHaveLength(1);
        expect(listed.sidecar.toolIndex[0]?.id).toBe('browser_network_requests');
    });

    it('expands a folded tool and exposes its schema on the next list', async () => {
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate', 'browser_snapshot'],
                    indexedTools: ['browser_network_requests'],
                    toolCards: {
                        browser_network_requests: {
                            summary: 'Inspect network requests only when diagnostics are needed.',
                            keywords: ['network requests', '网络请求']
                        }
                    }
                }
            },
            downstream: createDownstreamClient()
        });

        await runtime.initialize();
        const expandResult = await runtime.callTool('mcp_plus.expand', { request: '查看网络请求' });
        const listed = await runtime.listTools();

        expect(JSON.stringify(expandResult)).toContain('browser_network_requests');
        expect(listed.tools.map(tool => tool.name)).toEqual([
            'browser_navigate',
            'browser_network_requests',
            'browser_snapshot',
            'mcp_plus.expand',
            'mcp_plus.skill_read',
            'mcp_plus.skill_write'
        ]);
        expect(JSON.stringify(listed.tools)).toContain('includeHeaders');
    });

    it('persists skill notes for the MCP+ server and exposes a compact skill index', async () => {
        const skillStore = createMemorySkillStore();
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate', 'browser_snapshot']
                },
                skills: {
                    chapters: [
                        {
                            id: 'basic-page-read',
                            title: 'Basic page read',
                            summary: 'Navigate first, then snapshot.'
                        }
                    ]
                }
            },
            downstream: createDownstreamClient(),
            skillStore
        });

        await runtime.initialize();
        await runtime.callTool('mcp_plus.skill_write', {
            chapter: 'basic-page-read',
            title: 'Read dynamic pages',
            summary: 'Use snapshot first; expand console only when visible state is insufficient.',
            steps: ['browser_navigate to the URL', 'browser_snapshot before diagnostics'],
            whenToUse: 'Browser page-reading tasks',
            avoid: 'Do not call network tools before snapshot evidence.'
        });

        const listed = await runtime.listTools();
        const readResult = await runtime.callTool('mcp_plus.skill_read', {
            chapter: 'basic-page-read'
        });

        expect(listed.sidecar.skillIndex).toEqual([
            {
                id: 'basic-page-read',
                title: 'Basic page read',
                summary: 'Navigate first, then snapshot.',
                serverId: 'playwright-plus'
            },
            {
                id: 'basic-page-read:read-dynamic-pages',
                title: 'Read dynamic pages',
                summary: 'Use snapshot first; expand console only when visible state is insufficient.',
                serverId: 'playwright-plus'
            }
        ]);
        expect(JSON.stringify(listed.tools)).toContain('Read dynamic pages');
        expect(JSON.stringify(readResult)).toContain('browser_snapshot before diagnostics');
        expect(JSON.stringify(readResult)).toContain('Do not call network tools before snapshot evidence.');
    });

    it('forwards native tool calls to the downstream MCP server', async () => {
        const downstream = createDownstreamClient();
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream
        });

        await runtime.initialize();
        const result = await runtime.callTool('browser_navigate', { url: 'https://example.com' });

        expect(result).toEqual({
            content: [
                {
                    type: 'text',
                    text: 'called browser_navigate {"url":"https://example.com"}'
                }
            ]
        });
        expect(downstream.calls).toEqual([{ name: 'browser_navigate', arguments: { url: 'https://example.com' } }]);
    });
});

function createDownstreamClient(): DownstreamMcpClient & { calls: Array<{ name: string; arguments?: unknown }> } {
    const calls: Array<{ name: string; arguments?: unknown }> = [];

    return {
        calls,
        async listTools() {
            return { tools: nativeTools };
        },
        async callTool(params) {
            calls.push(params);
            return {
                content: [
                    {
                        type: 'text',
                        text: `called ${params.name} ${JSON.stringify(params.arguments)}`
                    }
                ]
            };
        }
    };
}
