import { describe, expect, it } from 'vitest';

import { createProxyRuntime, type DownstreamMcpClient } from '../src/proxyRuntime.js';
import { createMemorySkillStore } from '../src/skillStore.js';
import type { NativeToolDeclaration } from '@praxis-ai/mcp-plus';

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
            'mcp_plus.finish',
            'mcp_plus.skill_read',
            'mcp_plus.skill_write'
        ]);
        expect(JSON.stringify(listed.tools)).not.toContain('includeHeaders');
        expect(listed.sidecar.toolIndex).toHaveLength(1);
        expect(listed.sidecar.toolIndex[0]?.id).toBe('browser_network_requests');
    });

    it('merges downstream MCP capabilities during initialize', async () => {
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream: createDownstreamClient({
                initializeResult: {
                    protocolVersion: '2025-06-18',
                    capabilities: {
                        resources: {
                            listChanged: true
                        },
                        prompts: {},
                        logging: {},
                        completions: {},
                        tools: {
                            listChanged: false
                        }
                    },
                    serverInfo: {
                        name: 'downstream',
                        version: '1.2.3'
                    },
                    instructions: 'Downstream instructions.'
                }
            })
        });

        await expect(runtime.initialize()).resolves.toEqual({
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
            },
            instructions: 'Downstream instructions.'
        });
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
            'mcp_plus.finish',
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
                serverId: 'playwright-plus',
                whenToUse: 'Browser page-reading tasks',
                pitfallsPreview: ['Do not call network tools before snapshot evidence.']
            }
        ]);
        expect(JSON.stringify(listed.tools)).toContain('Read dynamic pages');
        expect(JSON.stringify(listed.tools)).toContain('when: Browser page-reading tasks');
        expect(JSON.stringify(listed.tools)).toContain('pitfalls: Do not call network tools before snapshot evidence.');
        expect(JSON.stringify(readResult)).toContain('browser_snapshot before diagnostics');
        expect(JSON.stringify(readResult)).toContain('Do not call network tools before snapshot evidence.');
    });

    it('reads persisted skill notes by stored note id as well as chapter id', async () => {
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
                }
            },
            downstream: createDownstreamClient(),
            skillStore
        });

        await runtime.initialize();
        await runtime.callTool('mcp_plus.skill_write', {
            chapter: 'basic-page-read',
            title: 'Simple Page Read Order',
            summary: 'Navigate first, then snapshot.',
            steps: ['browser_navigate', 'browser_snapshot']
        });

        const readResult = await runtime.callTool('mcp_plus.skill_read', {
            chapter: 'basic-page-read:simple-page-read-order'
        });

        expect(JSON.stringify(readResult)).toContain('Navigate first, then snapshot.');
        expect(JSON.stringify(readResult)).toContain('browser_snapshot');
    });

    it('surfaces explicit instructions to write new success and failure experience into skills', async () => {
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
            downstream: createDownstreamClient()
        });

        await runtime.initialize();
        const listed = await runtime.listTools();
        const descriptions = listed.tools.map(tool => tool.description).join('\n\n');

        expect(descriptions).toContain('If no stored note covers the workflow');
        expect(descriptions).toContain('successful MCP usage pattern');
        expect(descriptions).toContain('failure or pitfall');
        expect(descriptions).toContain('finish with mcp_plus.finish before the final answer');
        expect(descriptions).toContain('Default shouldWrite to true');
        expect(descriptions).toContain('after two or more MCP tool calls');
        expect(descriptions).toContain('Use shouldWrite false only when a stored note already covers the workflow');
    });

    it('adds a visible skill write reminder after native MCP calls when the server has no stored notes', async () => {
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream: createDownstreamClient(),
            skillStore: createMemorySkillStore()
        });

        await runtime.initialize();
        const result = await runtime.callTool('browser_navigate', { url: 'https://example.com' });

        expect(JSON.stringify(result)).toContain('MCP+ skill reminder');
        expect(JSON.stringify(result)).toContain('finish with mcp_plus.finish before the final answer');
        expect(JSON.stringify(result)).toContain('Default shouldWrite to true');
        expect(JSON.stringify(result)).toContain('after any stateful browser/form/debugging interaction');
    });

    it('finishes the MCP+ workflow and writes a skill note when requested', async () => {
        const skillStore = createMemorySkillStore();
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream: createDownstreamClient(),
            skillStore
        });

        await runtime.initialize();
        const result = await runtime.callTool('mcp_plus.finish', {
            finalAnswer: 'Done with the browser workflow.',
            skill: {
                shouldWrite: true,
                chapter: 'basic-page-read',
                title: 'Simple Browser Finish',
                summary: 'Open the page, inspect state, and finish through MCP+.',
                whenToUse: 'Simple form/quiz tasks in Chrome DevTools MCP+',
                do: ['browser_navigate', 'browser_snapshot', 'mcp_plus.finish'],
                why: 'Snapshot gives semantic labels and stable-enough uids, more reliable than screenshot guessing.',
                pitfalls: ['Do not skip the final state check.'],
                steps: ['legacy compatibility step'],
                avoid: 'Legacy compatibility avoid text.'
            }
        });

        expect(JSON.stringify(result)).toContain('Done with the browser workflow.');
        expect(JSON.stringify(result)).toContain('skillWritten');
        expect(await skillStore.read('playwright-plus', { chapter: 'basic-page-read' })).toEqual([
            expect.objectContaining({
                id: 'basic-page-read:simple-browser-finish',
                title: 'Simple Browser Finish',
                summary: 'Open the page, inspect state, and finish through MCP+.',
                whenToUse: 'Simple form/quiz tasks in Chrome DevTools MCP+',
                do: ['browser_navigate', 'browser_snapshot', 'mcp_plus.finish'],
                why: 'Snapshot gives semantic labels and stable-enough uids, more reliable than screenshot guessing.',
                pitfalls: ['Do not skip the final state check.']
            })
        ]);
    });

    it('finishes the MCP+ workflow without writing a skill note when skipped', async () => {
        const skillStore = createMemorySkillStore();
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream: createDownstreamClient(),
            skillStore
        });

        await runtime.initialize();
        const result = await runtime.callTool('mcp_plus.finish', {
            finalAnswer: 'Done, no reusable workflow.',
            skill: {
                shouldWrite: false
            }
        });

        expect(JSON.stringify(result)).toContain('Done, no reusable workflow.');
        expect(JSON.stringify(result)).toContain('skillSkipped');
        expect(await skillStore.list('playwright-plus')).toEqual([]);
    });

    it('does not add the native call skill reminder when stored notes already exist', async () => {
        const skillStore = createMemorySkillStore({
            'playwright-plus': [
                {
                    id: 'basic-page-read:simple',
                    chapter: 'basic-page-read',
                    title: 'Simple',
                    summary: 'Existing note.',
                    steps: ['browser_navigate'],
                    updatedAt: '2026-06-03T00:00:00.000Z'
                }
            ]
        });
        const runtime = createProxyRuntime({
            manifest: {
                server: {
                    id: 'playwright-plus',
                    title: 'Playwright MCP+',
                    summary: 'Browser automation with folded lower-frequency capabilities.'
                },
                exposure: {
                    pinnedTools: ['browser_navigate']
                }
            },
            downstream: createDownstreamClient(),
            skillStore
        });

        await runtime.initialize();
        const result = await runtime.callTool('browser_navigate', { url: 'https://example.com' });

        expect(JSON.stringify(result)).not.toContain('MCP+ skill reminder');
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

        expect(isCallToolResult(result) ? result.content[0]?.text : undefined).toBe(
            'called browser_navigate {"url":"https://example.com"}'
        );
        expect(downstream.calls).toEqual([{ name: 'browser_navigate', arguments: { url: 'https://example.com' } }]);
    });

    it('forwards non-tool requests and notifications to the downstream MCP server', async () => {
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

        await expect(runtime.forwardRequest('resources/list', { cursor: 'next' })).resolves.toEqual({
            forwarded: 'resources/list',
            params: { cursor: 'next' }
        });
        await runtime.forwardNotification('notifications/initialized', {});

        expect(downstream.requests).toEqual([{ method: 'resources/list', params: { cursor: 'next' } }]);
        expect(downstream.notifications).toEqual([{ method: 'notifications/initialized', params: {} }]);
    });
});

function isCallToolResult(value: unknown): value is { content: Array<{ type: string; text?: string }> } {
    return typeof value === 'object' && value !== null && 'content' in value && Array.isArray(value.content);
}

function createDownstreamClient(options?: {
    initializeResult?: NonNullable<ReturnType<Required<DownstreamMcpClient>['getInitializeResult']>>;
}): DownstreamMcpClient & {
    calls: Array<{ name: string; arguments?: unknown }>;
    requests: Array<{ method: string; params?: unknown }>;
    notifications: Array<{ method: string; params?: unknown }>;
} {
    const calls: Array<{ name: string; arguments?: unknown }> = [];
    const requests: Array<{ method: string; params?: unknown }> = [];
    const notifications: Array<{ method: string; params?: unknown }> = [];

    return {
        calls,
        requests,
        notifications,
        getInitializeResult() {
            return options?.initializeResult;
        },
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
        },
        async request(params) {
            requests.push(params);
            return {
                forwarded: params.method,
                params: params.params
            };
        },
        async notification(params) {
            notifications.push(params);
        }
    };
}
