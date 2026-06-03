import {
    compileMcpPlusManifest,
    lowerExposurePlanToMcpSurface,
    McpPlusWrapperRuntime,
    planExposure,
    type McpCompatibleSurface,
    type McpPlusManifest,
    type NativeToolDeclaration
} from '@mcp-plus/core';

import { createMemorySkillStore, type SkillNote, type SkillStore } from './skillStore.js';

export type DownstreamListToolsResult = {
    tools: NativeToolDeclaration[];
};

export type DownstreamCallToolParams = {
    name: string;
    arguments?: unknown;
};

export type DownstreamMcpClient = {
    listTools(): Promise<DownstreamListToolsResult>;
    callTool(params: DownstreamCallToolParams): Promise<unknown>;
};

export type ProxyRuntimeOptions = {
    manifest: McpPlusManifest;
    downstream: DownstreamMcpClient;
    initialMode?: 'expanded' | 'indexed' | 'frozen';
    skillStore?: SkillStore;
};

export type ListToolsWithSidecarResult = McpCompatibleSurface;

export type ProxyRuntime = {
    initialize(): Promise<void>;
    listTools(): Promise<ListToolsWithSidecarResult>;
    callTool(name: string, args?: unknown): Promise<unknown>;
};

export function createProxyRuntime(options: ProxyRuntimeOptions): ProxyRuntime {
    let wrapper: McpPlusWrapperRuntime | undefined;
    let surface: McpCompatibleSurface | undefined;
    const skillStore = options.skillStore ?? createMemorySkillStore();

    async function ensureInitialized(): Promise<void> {
        if (wrapper !== undefined && surface !== undefined) {
            return;
        }

        const { tools } = await options.downstream.listTools();
        const graph = compileMcpPlusManifest(options.manifest, tools);
        const plan = planExposure(graph, {
            serverId: options.manifest.server.id,
            mode: options.initialMode ?? 'expanded',
            activeTools: []
        });

        wrapper = new McpPlusWrapperRuntime(graph, {
            serverId: options.manifest.server.id,
            mode: options.initialMode ?? 'expanded',
            activeTools: []
        });
        surface = lowerExposurePlanToMcpSurface(plan);
    }

    async function refreshSurface(): Promise<void> {
        if (wrapper === undefined) {
            await ensureInitialized();
            return;
        }

        surface = wrapper.getSurface();
    }

    return {
        async initialize() {
            await ensureInitialized();
        },

        async listTools() {
            await ensureInitialized();
            if (surface === undefined) {
                throw new Error('MCP+ proxy surface was not initialized');
            }
            const currentSurface = surface;

            const persistedSkillNotes = await skillStore.list(options.manifest.server.id);
            const enrichedSurface = withPersistedSkillIndex(currentSurface, options.manifest.server.id, persistedSkillNotes);

            return {
                ...enrichedSurface,
                tools: [
                    ...enrichedSurface.tools.map(tool =>
                        tool.name === 'mcp_plus.expand' ? withIndexInExpandDescription(tool, enrichedSurface) : tool
                    ),
                    createSkillReadToolDeclaration(enrichedSurface, persistedSkillNotes),
                    createSkillWriteToolDeclaration(enrichedSurface)
                ]
            };
        },

        async callTool(name, args) {
            await ensureInitialized();
            if (name === 'mcp_plus.expand') {
                if (wrapper === undefined) {
                    throw new Error('MCP+ wrapper runtime was not initialized');
                }

                const result = await wrapper.expand(normalizeExpandArgs(args));
                await refreshSurface();
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }

            if (name === 'mcp_plus.skill_read') {
                const notes = await skillStore.read(options.manifest.server.id, normalizeSkillReadArgs(args));
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                serverId: options.manifest.server.id,
                                notes
                            })
                        }
                    ]
                };
            }

            if (name === 'mcp_plus.skill_write') {
                const note = await skillStore.write(options.manifest.server.id, normalizeSkillWriteArgs(args));
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                serverId: options.manifest.server.id,
                                note
                            })
                        }
                    ]
                };
            }

            return options.downstream.callTool({ name, arguments: args });
        }
    };
}

function normalizeExpandArgs(args: unknown): { server?: string; request: string } {
    if (isRecord(args) && typeof args.request === 'string') {
        return {
            server: typeof args.server === 'string' ? args.server : undefined,
            request: args.request
        };
    }

    return {
        request: typeof args === 'string' ? args : JSON.stringify(args ?? {})
    };
}

function normalizeSkillReadArgs(args: unknown): { chapter?: string } {
    if (args === undefined || args === null) {
        return {};
    }
    if (isRecord(args)) {
        return typeof args.chapter === 'string' ? { chapter: args.chapter } : {};
    }
    return {};
}

function normalizeSkillWriteArgs(args: unknown): {
    chapter: string;
    title: string;
    summary: string;
    steps?: string[];
    whenToUse?: string;
    avoid?: string;
} {
    if (!isRecord(args)) {
        throw new Error('mcp_plus.skill_write requires object arguments');
    }
    if (typeof args.chapter !== 'string' || typeof args.title !== 'string' || typeof args.summary !== 'string') {
        throw new Error('mcp_plus.skill_write requires chapter, title, and summary strings');
    }

    return {
        chapter: args.chapter,
        title: args.title,
        summary: args.summary,
        steps: Array.isArray(args.steps) ? args.steps.filter(step => typeof step === 'string') : undefined,
        whenToUse: typeof args.whenToUse === 'string' ? args.whenToUse : undefined,
        avoid: typeof args.avoid === 'string' ? args.avoid : undefined
    };
}

function withIndexInExpandDescription(tool: NativeToolDeclaration, surface: McpCompatibleSurface): NativeToolDeclaration {
    const indexLines = surface.sidecar.toolIndex.map(entry => `- ${entry.id}: ${entry.summary}`).join('\n');
    const skillLines = surface.sidecar.skillIndex.map(entry => `- ${entry.title}: ${entry.summary}`).join('\n');
    const sections = [
        tool.description,
        `Server: ${surface.sidecar.serverCard.title}. ${surface.sidecar.serverCard.summary}`,
        indexLines.length > 0 ? `Folded tool index:\n${indexLines}` : undefined,
        skillLines.length > 0 ? `Skill index:\n${skillLines}` : undefined
    ].filter(Boolean);

    return {
        ...tool,
        description: sections.join('\n\n')
    };
}

function createSkillReadToolDeclaration(surface: McpCompatibleSurface, notes: readonly SkillNote[]): NativeToolDeclaration {
    const skillLines = surface.sidecar.skillIndex.map(entry => `- ${entry.id}: ${entry.summary}`).join('\n');
    const storedLines = notes.map(note => `- ${note.id}: ${note.summary}`).join('\n');
    const sections = [
        'Read stored MCP+ skill notes for this server before complex or repeated workflows.',
        skillLines.length > 0 ? `Skill index:\n${skillLines}` : undefined,
        storedLines.length > 0 ? `Stored notes:\n${storedLines}` : undefined
    ].filter(Boolean);

    return {
        name: 'mcp_plus.skill_read',
        description: sections.join('\n\n'),
        inputSchema: {
            type: 'object',
            properties: {
                chapter: {
                    type: 'string',
                    description: 'Optional chapter id to read. Omit to read all stored notes for this MCP server.'
                }
            },
            additionalProperties: false
        }
    };
}

function createSkillWriteToolDeclaration(surface: McpCompatibleSurface): NativeToolDeclaration {
    const skillLines = surface.sidecar.skillIndex.map(entry => `- ${entry.id}: ${entry.summary}`).join('\n');
    const sections = [
        'Write or update a compact MCP+ skill note after a successful multi-step workflow with this MCP server.',
        'Store reusable behavior, tool ordering, failure avoidance, and when to use the workflow.',
        skillLines.length > 0 ? `Available chapters:\n${skillLines}` : undefined
    ].filter(Boolean);

    return {
        name: 'mcp_plus.skill_write',
        description: sections.join('\n\n'),
        inputSchema: {
            type: 'object',
            properties: {
                chapter: {
                    type: 'string',
                    description: 'Skill chapter id.'
                },
                title: {
                    type: 'string',
                    description: 'Short reusable workflow title.'
                },
                summary: {
                    type: 'string',
                    description: 'One concise sentence explaining the learned behavior.'
                },
                steps: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Stable ordered steps that worked.'
                },
                whenToUse: {
                    type: 'string',
                    description: 'Task pattern where this note should be read.'
                },
                avoid: {
                    type: 'string',
                    description: 'Known wasteful or failing behavior to avoid.'
                }
            },
            required: ['chapter', 'title', 'summary'],
            additionalProperties: false
        }
    };
}

function withPersistedSkillIndex(
    surface: McpCompatibleSurface,
    serverId: string,
    notes: readonly SkillNote[]
): McpCompatibleSurface {
    const persistedEntries = notes.map(note => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
        serverId
    }));

    return {
        ...surface,
        sidecar: {
            ...surface.sidecar,
            skillIndex: [...surface.sidecar.skillIndex, ...persistedEntries]
        }
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
