import {
    compileMcpPlusManifest,
    lowerExposurePlanToMcpSurface,
    McpPlusWrapperRuntime,
    planExposure,
    type McpCompatibleSurface,
    type McpPlusManifest,
    type NativeToolDeclaration
} from '@praxis-ai/mcp-plus';

import { createMemorySkillStore, type SkillNote, type SkillStore } from './skillStore.js';

export type DownstreamListToolsResult = {
    tools: NativeToolDeclaration[];
};

export type DownstreamCallToolParams = {
    name: string;
    arguments?: unknown;
};

export type DownstreamRequestParams = {
    method: string;
    params?: unknown;
};

export type DownstreamNotificationParams = {
    method: string;
    params?: unknown;
};

export type DownstreamInitializeResult = {
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    serverInfo?: {
        name?: string;
        version?: string;
    };
    instructions?: string;
};

export type ProxyInitializeResult = {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    serverInfo: {
        name: string;
        version: string;
    };
    instructions?: string;
};

export type DownstreamMcpClient = {
    getInitializeResult?(): DownstreamInitializeResult | undefined;
    listTools(): Promise<DownstreamListToolsResult>;
    callTool(params: DownstreamCallToolParams): Promise<unknown>;
    request?(params: DownstreamRequestParams): Promise<unknown>;
    notification?(params: DownstreamNotificationParams): Promise<void>;
};

export type ProxyRuntimeOptions = {
    manifest: McpPlusManifest;
    downstream: DownstreamMcpClient;
    initialMode?: 'expanded' | 'indexed' | 'frozen';
    skillStore?: SkillStore;
};

export type ListToolsWithSidecarResult = McpCompatibleSurface;

export type ProxyRuntime = {
    initialize(): Promise<ProxyInitializeResult>;
    listTools(): Promise<ListToolsWithSidecarResult>;
    callTool(name: string, args?: unknown): Promise<unknown>;
    forwardRequest(method: string, params?: unknown): Promise<unknown>;
    forwardNotification(method: string, params?: unknown): Promise<void>;
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
            return createProxyInitializeResult(options.downstream.getInitializeResult?.());
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
                    createFinishToolDeclaration(enrichedSurface),
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

            if (name === 'mcp_plus.finish') {
                const finish = normalizeFinishArgs(args);
                const note =
                    finish.skill.shouldWrite === true
                        ? await skillStore.write(options.manifest.server.id, {
                              chapter: finish.skill.chapter,
                              title: finish.skill.title,
                              summary: finish.skill.summary,
                              steps: finish.skill.steps,
                              do: finish.skill.do,
                              whenToUse: finish.skill.whenToUse,
                              why: finish.skill.why,
                              avoid: finish.skill.avoid,
                              pitfalls: finish.skill.pitfalls
                          })
                        : undefined;
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                serverId: options.manifest.server.id,
                                finalAnswer: finish.finalAnswer,
                                status: note === undefined ? 'skillSkipped' : 'skillWritten',
                                note
                            })
                        }
                    ]
                };
            }

            const downstreamResult = await options.downstream.callTool({ name, arguments: args });
            const persistedSkillNotes = await skillStore.list(options.manifest.server.id);
            return persistedSkillNotes.length === 0 ? withSkillLifecycleResultReminder(downstreamResult) : downstreamResult;
        },

        async forwardRequest(method, params) {
            await ensureInitialized();
            if (options.downstream.request === undefined) {
                throw new Error(`Downstream MCP client cannot forward request method: ${method}`);
            }

            return options.downstream.request({ method, params });
        },

        async forwardNotification(method, params) {
            await ensureInitialized();
            if (options.downstream.notification === undefined) {
                return;
            }

            await options.downstream.notification({ method, params });
        }
    };
}

function createProxyInitializeResult(downstream: DownstreamInitializeResult | undefined): ProxyInitializeResult {
    const downstreamCapabilities = downstream?.capabilities ?? {};
    const downstreamTools = isRecord(downstreamCapabilities.tools) ? downstreamCapabilities.tools : {};
    const result: ProxyInitializeResult = {
        protocolVersion: downstream?.protocolVersion ?? '2025-06-18',
        capabilities: {
            ...downstreamCapabilities,
            tools: {
                ...downstreamTools,
                listChanged: true
            }
        },
        serverInfo: {
            name: 'mcp-plus-stdio-proxy',
            version: '0.0.0'
        }
    };

    if (downstream?.instructions !== undefined) {
        result.instructions = downstream.instructions;
    }

    return result;
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
    do?: string[];
    whenToUse?: string;
    why?: string;
    avoid?: string;
    pitfalls?: string[];
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
        do: Array.isArray(args.do) ? args.do.filter(step => typeof step === 'string') : undefined,
        whenToUse: typeof args.whenToUse === 'string' ? args.whenToUse : undefined,
        why: typeof args.why === 'string' ? args.why : undefined,
        avoid: typeof args.avoid === 'string' ? args.avoid : undefined,
        pitfalls: Array.isArray(args.pitfalls) ? args.pitfalls.filter(pitfall => typeof pitfall === 'string') : undefined
    };
}

function normalizeFinishArgs(args: unknown): {
    finalAnswer: string;
    skill:
        | {
              shouldWrite: false;
          }
        | {
              shouldWrite: true;
              chapter: string;
              title: string;
              summary: string;
              steps?: string[];
              do?: string[];
              whenToUse?: string;
              why?: string;
              avoid?: string;
              pitfalls?: string[];
          };
} {
    if (!isRecord(args) || typeof args.finalAnswer !== 'string' || !isRecord(args.skill)) {
        throw new Error('mcp_plus.finish requires finalAnswer and skill object arguments');
    }
    if (args.skill.shouldWrite !== true) {
        return {
            finalAnswer: args.finalAnswer,
            skill: {
                shouldWrite: false
            }
        };
    }
    if (
        typeof args.skill.chapter !== 'string' ||
        typeof args.skill.title !== 'string' ||
        typeof args.skill.summary !== 'string'
    ) {
        throw new Error('mcp_plus.finish skill writes require chapter, title, and summary strings');
    }

    return {
        finalAnswer: args.finalAnswer,
        skill: {
            shouldWrite: true,
            chapter: args.skill.chapter,
            title: args.skill.title,
            summary: args.skill.summary,
            steps: Array.isArray(args.skill.steps) ? args.skill.steps.filter(step => typeof step === 'string') : undefined,
            do: Array.isArray(args.skill.do) ? args.skill.do.filter(step => typeof step === 'string') : undefined,
            whenToUse: typeof args.skill.whenToUse === 'string' ? args.skill.whenToUse : undefined,
            why: typeof args.skill.why === 'string' ? args.skill.why : undefined,
            avoid: typeof args.skill.avoid === 'string' ? args.skill.avoid : undefined,
            pitfalls: Array.isArray(args.skill.pitfalls)
                ? args.skill.pitfalls.filter(pitfall => typeof pitfall === 'string')
                : undefined
        }
    };
}

function withIndexInExpandDescription(tool: NativeToolDeclaration, surface: McpCompatibleSurface): NativeToolDeclaration {
    const indexLines = surface.sidecar.toolIndex.map(entry => `- ${entry.id}: ${entry.summary}`).join('\n');
    const skillLines = surface.sidecar.skillIndex.map(formatSkillIndexEntry).join('\n');
    const sections = [
        tool.description,
        `Server: ${surface.sidecar.serverCard.title}. ${surface.sidecar.serverCard.summary}`,
        createSkillLifecycleInstruction(),
        indexLines.length > 0 ? `Folded tool index:\n${indexLines}` : undefined,
        skillLines.length > 0 ? `Skill index:\n${skillLines}` : undefined
    ].filter(Boolean);

    return {
        ...tool,
        description: sections.join('\n\n')
    };
}

function createSkillReadToolDeclaration(surface: McpCompatibleSurface, notes: readonly SkillNote[]): NativeToolDeclaration {
    const skillLines = surface.sidecar.skillIndex.map(formatSkillIndexEntry).join('\n');
    const storedLines = notes.map(formatStoredSkillNoteLine).join('\n');
    const sections = [
        'Read stored MCP+ skill notes for this server before complex or repeated workflows.',
        createSkillLifecycleInstruction(),
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
                    description: 'Optional chapter id or stored note id to read. Omit to read all stored notes for this MCP server.'
                }
            },
            additionalProperties: false
        }
    };
}

function createSkillWriteToolDeclaration(surface: McpCompatibleSurface): NativeToolDeclaration {
    const skillLines = surface.sidecar.skillIndex.map(formatSkillIndexEntry).join('\n');
    const sections = [
        'Write or update a compact MCP+ skill note after a successful multi-step workflow with this MCP server.',
        'Store reusable behavior, tool ordering, failure avoidance, and when to use the workflow.',
        createSkillLifecycleInstruction(),
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
                whenToUse: {
                    type: 'string',
                    description: 'Specific task pattern where this skill card should be applied.'
                },
                do: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Actionable ordered checklist for the next model to follow.'
                },
                why: {
                    type: 'string',
                    description: 'Why this workflow is reliable or better than alternatives.'
                },
                pitfalls: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Failure modes, stale-state hazards, and checks to remember.'
                },
                steps: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Legacy alias for do.'
                },
                avoid: {
                    type: 'string',
                    description: 'Legacy compact alias for pitfalls.'
                }
            },
            required: ['chapter', 'title', 'summary'],
            additionalProperties: false
        }
    };
}

function createFinishToolDeclaration(surface: McpCompatibleSurface): NativeToolDeclaration {
    const skillLines = surface.sidecar.skillIndex.map(formatSkillIndexEntry).join('\n');
    const sections = [
        'Finish an MCP+ workflow for this server. Use this after non-trivial MCP-heavy work to return the final answer and decide whether to write a reusable skill note.',
        createSkillLifecycleInstruction(),
        skillLines.length > 0 ? `Available skill chapters and notes:\n${skillLines}` : undefined
    ].filter(Boolean);

    return {
        name: 'mcp_plus.finish',
        description: sections.join('\n\n'),
        inputSchema: {
            type: 'object',
            properties: {
                finalAnswer: {
                    type: 'string',
                    description: 'The concise final answer to give the user after this MCP workflow.'
                },
                skill: {
                    type: 'object',
                    properties: {
                        shouldWrite: {
                            type: 'boolean',
                            description: 'True when this workflow produced a reusable MCP usage pattern, failure, or pitfall.'
                        },
                        chapter: {
                            type: 'string',
                            description: 'Skill chapter id when shouldWrite is true.'
                        },
                        title: {
                            type: 'string',
                            description: 'Short reusable workflow title when shouldWrite is true.'
                        },
                        summary: {
                            type: 'string',
                            description: 'One concise sentence explaining the learned behavior when shouldWrite is true.'
                        },
                        whenToUse: {
                            type: 'string',
                            description: 'Specific task pattern where this skill card should be applied.'
                        },
                        do: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Actionable ordered checklist for the next model to follow.'
                        },
                        why: {
                            type: 'string',
                            description: 'Why this workflow is reliable or better than alternatives.'
                        },
                        pitfalls: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Failure modes, stale-state hazards, and checks to remember.'
                        },
                        steps: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Legacy alias for do.'
                        },
                        avoid: {
                            type: 'string',
                            description: 'Legacy compact alias for pitfalls.'
                        }
                    },
                    required: ['shouldWrite'],
                    additionalProperties: false
                }
            },
            required: ['finalAnswer', 'skill'],
            additionalProperties: false
        }
    };
}

function createSkillLifecycleInstruction(): string {
    return [
        'Skill lifecycle: If no stored note covers the workflow and this task produced a reusable successful MCP usage pattern, failure or pitfall, finish with mcp_plus.finish before the final answer.',
        'Default shouldWrite to true after a successful first-time workflow, after two or more MCP tool calls, or after any stateful browser/form/debugging interaction.',
        'Use shouldWrite false only when a stored note already covers the workflow or there is genuinely no reusable tool order, pitfall, or future guidance.',
        'Write skill notes as actionable cards: whenToUse for the task pattern, do for the ordered checklist, why for the reliability rationale, and pitfalls for stale-state hazards or failure checks.'
    ].join(' ');
}

function withSkillLifecycleResultReminder(result: unknown): unknown {
    if (!isRecord(result) || !Array.isArray(result.content)) {
        return result;
    }

    return {
        ...result,
        content: [
            ...result.content,
            {
                type: 'text',
                text: `MCP+ skill reminder: ${createSkillLifecycleInstruction()}`
            }
        ]
    };
}

function formatSkillIndexEntry(entry: McpCompatibleSurface['sidecar']['skillIndex'][number]): string {
    const details = [
        entry.whenToUse === undefined ? undefined : `when: ${entry.whenToUse}`,
        entry.why === undefined ? undefined : `why: ${entry.why}`,
        entry.pitfallsPreview === undefined || entry.pitfallsPreview.length === 0
            ? undefined
            : `pitfalls: ${entry.pitfallsPreview.join('; ')}`
    ].filter(Boolean);

    return `- ${entry.id} [${entry.title}]: ${entry.summary}${details.length > 0 ? ` (${details.join(' | ')})` : ''}`;
}

function formatStoredSkillNoteLine(note: SkillNote): string {
    const details = [
        note.whenToUse === undefined ? undefined : `when: ${note.whenToUse}`,
        note.why === undefined ? undefined : `why: ${note.why}`,
        note.pitfalls === undefined || note.pitfalls.length === 0 ? undefined : `pitfalls: ${note.pitfalls.join('; ')}`
    ].filter(Boolean);

    return `- ${note.id} [${note.title}]: ${note.summary}${details.length > 0 ? ` (${details.join(' | ')})` : ''}`;
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
        serverId,
        whenToUse: note.whenToUse,
        why: note.why,
        pitfallsPreview: note.pitfalls?.slice(0, 2)
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
