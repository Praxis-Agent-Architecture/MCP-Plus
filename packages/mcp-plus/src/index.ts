export type JsonSchema = {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean;
    description?: string;
    enum?: string[];
    items?: JsonSchema;
    [key: string]: unknown;
};

export type NativeToolDeclaration = {
    name: string;
    description: string;
    inputSchema: JsonSchema;
};

export type McpPlusServerManifest = {
    id: string;
    title?: string;
    summary: string;
};

export type McpPlusExposurePolicy = {
    pinnedTools?: string[];
    warmTools?: string[];
    indexedTools?: string[];
    alwaysIndexTools?: string[];
    toolCards?: Record<string, ToolCardPolicy>;
    freezeAfterUnusedTurns?: number;
    warmAfterConsecutiveCalls?: number;
    demoteAfterUnusedTurns?: number;
};

export type ToolCardPolicy = {
    title?: string;
    summary?: string;
    keywords?: string[];
};

export type McpPlusSkillChapter = {
    id: string;
    title: string;
    summary: string;
};

export type McpPlusSkillPolicy = {
    storage?: string;
    chapters?: McpPlusSkillChapter[];
};

export type McpPlusManifest = {
    server: McpPlusServerManifest;
    exposure?: McpPlusExposurePolicy;
    skills?: McpPlusSkillPolicy;
};

export type CapabilityActivation = {
    serverId: string;
    toolName: string;
};

export type ToolIndexEntry = {
    id: string;
    title: string;
    summary: string;
    activation: CapabilityActivation;
    pinned: boolean;
};

export type SkillIndexEntry = {
    id: string;
    title: string;
    summary: string;
    serverId: string;
};

export type ServerCard = {
    id: string;
    title: string;
    summary: string;
    mode: ExposureMode;
};

export type ExposureMode = 'expanded' | 'indexed' | 'frozen';

export type ExposureGraph = {
    server: McpPlusServerManifest;
    tools: NativeToolDeclaration[];
    pinnedToolNames: Set<string>;
    warmToolNames: Set<string>;
    indexedToolNames: Set<string>;
    alwaysIndexToolNames: Set<string>;
    toolCards: Record<string, ToolCardPolicy>;
    skillIndex: SkillIndexEntry[];
    policy: Required<Pick<McpPlusExposurePolicy, 'freezeAfterUnusedTurns' | 'warmAfterConsecutiveCalls' | 'demoteAfterUnusedTurns'>>;
};

export type ExposureState = {
    serverId: string;
    mode: ExposureMode;
    activeTools?: string[];
};

export type ExposurePlan = {
    serverCard: ServerCard;
    visibleTools: NativeToolDeclaration[];
    toolIndex: ToolIndexEntry[];
    skillIndex: SkillIndexEntry[];
};

export type McpPlusSidecar = {
    serverCard: ServerCard;
    toolIndex: ToolIndexEntry[];
    skillIndex: SkillIndexEntry[];
};

export type McpCompatibleSurface = {
    tools: NativeToolDeclaration[];
    sidecar: McpPlusSidecar;
};

export type ExposureImpactEstimate = {
    nativeToolCount: number;
    visibleToolCount: number;
    indexedToolCount: number;
    fullSchemaCharacters: number;
    visibleSchemaCharacters: number;
    foldedContextCharacters: number;
    schemaCharacterSavings: number;
    indexedActivationTurns: number;
    stableIndexCharacters: number;
};

export type ExpandRequest = {
    server?: string;
    request: string;
};

export type ExpandResult = {
    serverId: string;
    activatedTools: string[];
    mode: ExposureMode;
};

const DEFAULT_FREEZE_AFTER_UNUSED_TURNS = 5;
const DEFAULT_WARM_AFTER_CONSECUTIVE_CALLS = 2;
const DEFAULT_DEMOTE_AFTER_UNUSED_TURNS = 2;

export function compileMcpPlusManifest(manifest: McpPlusManifest, nativeTools: NativeToolDeclaration[]): ExposureGraph {
    const pinnedToolNames = new Set(manifest.exposure?.pinnedTools);
    const warmToolNames = new Set(manifest.exposure?.warmTools);
    const alwaysIndexToolNames = new Set(manifest.exposure?.alwaysIndexTools);
    const indexedToolNames = new Set([...(manifest.exposure?.indexedTools ?? []), ...alwaysIndexToolNames]);

    for (const tool of nativeTools) {
        if (!pinnedToolNames.has(tool.name) && !warmToolNames.has(tool.name)) {
            indexedToolNames.add(tool.name);
        }
    }

    return {
        server: manifest.server,
        tools: nativeTools.toSorted(compareByName),
        pinnedToolNames,
        warmToolNames,
        indexedToolNames,
        alwaysIndexToolNames,
        toolCards: manifest.exposure?.toolCards ?? {},
        skillIndex: (manifest.skills?.chapters ?? []).map(chapter => ({
            id: chapter.id,
            title: chapter.title,
            summary: chapter.summary,
            serverId: manifest.server.id
        })),
        policy: {
            freezeAfterUnusedTurns: manifest.exposure?.freezeAfterUnusedTurns ?? DEFAULT_FREEZE_AFTER_UNUSED_TURNS,
            warmAfterConsecutiveCalls: manifest.exposure?.warmAfterConsecutiveCalls ?? DEFAULT_WARM_AFTER_CONSECUTIVE_CALLS,
            demoteAfterUnusedTurns: manifest.exposure?.demoteAfterUnusedTurns ?? DEFAULT_DEMOTE_AFTER_UNUSED_TURNS
        }
    };
}

export function planExposure(graph: ExposureGraph, state: ExposureState): ExposurePlan {
    if (state.serverId !== graph.server.id) {
        throw new Error(`Exposure state server ${state.serverId} does not match graph server ${graph.server.id}`);
    }

    const serverCard = createServerCard(graph, state.mode);
    const expandTool = createExpandToolDeclaration();

    if (state.mode === 'frozen') {
        return {
            serverCard,
            visibleTools: [expandTool],
            toolIndex: [],
            skillIndex: []
        };
    }

    if (state.mode === 'indexed') {
        return {
            serverCard,
            visibleTools: [expandTool],
            toolIndex: graph.tools.map(tool => createToolIndexEntry(graph.server.id, graph.pinnedToolNames, graph.toolCards, tool)),
            skillIndex: graph.skillIndex
        };
    }

    const activeToolNames = new Set(state.activeTools);
    const visibleToolNames = new Set<string>([...graph.pinnedToolNames, ...graph.warmToolNames, ...activeToolNames]);
    for (const toolName of graph.alwaysIndexToolNames) {
        visibleToolNames.delete(toolName);
    }
    const visibleNativeTools = graph.tools.filter(tool => visibleToolNames.has(tool.name));
    const visibleTools = [...visibleNativeTools, expandTool];
    const toolIndex = graph.tools
        .filter(tool => !visibleToolNames.has(tool.name))
        .map(tool => createToolIndexEntry(graph.server.id, graph.pinnedToolNames, graph.toolCards, tool));

    return {
        serverCard,
        visibleTools,
        toolIndex,
        skillIndex: graph.skillIndex
    };
}

export function createExpandToolDeclaration(): NativeToolDeclaration {
    return {
        name: 'mcp_plus.expand',
        description: 'Ask MCP+ to activate folded MCP tools or skill guidance for a server.',
        inputSchema: {
            type: 'object',
            properties: {
                server: {
                    type: 'string',
                    description: 'Optional MCP server id to expand.'
                },
                request: {
                    type: 'string',
                    description: 'Natural-language capability request to match against the MCP+ index.'
                }
            },
            required: ['request'],
            additionalProperties: false
        }
    };
}

export function lowerExposurePlanToMcpSurface(plan: ExposurePlan): McpCompatibleSurface {
    return {
        tools: plan.visibleTools,
        sidecar: {
            serverCard: plan.serverCard,
            toolIndex: plan.toolIndex,
            skillIndex: plan.skillIndex
        }
    };
}

export function estimateExposurePlanImpact(graph: ExposureGraph, plan: ExposurePlan): ExposureImpactEstimate {
    const fullSchemaCharacters = JSON.stringify(graph.tools).length;
    const visibleSchemaCharacters = JSON.stringify(plan.visibleTools).length;
    const stableIndexCharacters = JSON.stringify(plan.toolIndex).length;
    const foldedContextCharacters = visibleSchemaCharacters + stableIndexCharacters;

    return {
        nativeToolCount: graph.tools.length,
        visibleToolCount: plan.visibleTools.length,
        indexedToolCount: plan.toolIndex.length,
        fullSchemaCharacters,
        visibleSchemaCharacters,
        foldedContextCharacters,
        schemaCharacterSavings: fullSchemaCharacters - foldedContextCharacters,
        indexedActivationTurns: plan.toolIndex.length > 0 ? 2 : 1,
        stableIndexCharacters
    };
}

export class ExposurePlanner {
    public constructor(private readonly graph: ExposureGraph) {}

    public plan(state: ExposureState): ExposurePlan {
        return planExposure(this.graph, state);
    }
}

export class McpPlusWrapperRuntime {
    #state: ExposureState;

    public constructor(
        private readonly graph: ExposureGraph,
        initialState?: Partial<ExposureState>
    ) {
        this.#state = {
            serverId: graph.server.id,
            mode: initialState?.mode ?? 'expanded',
            activeTools: initialState?.activeTools ?? []
        };
    }

    public getSurface(): McpCompatibleSurface {
        return lowerExposurePlanToMcpSurface(planExposure(this.graph, this.#state));
    }

    public expand(request: ExpandRequest): ExpandResult {
        if (request.server !== undefined && request.server !== this.graph.server.id) {
            return {
                serverId: this.graph.server.id,
                activatedTools: [],
                mode: this.#state.mode
            };
        }

        const matchedTools = this.#matchTools(request);
        const thawableTools = matchedTools.filter(toolName => !this.graph.alwaysIndexToolNames.has(toolName));
        const activatedTools = thawableTools.filter(toolName => !this.graph.pinnedToolNames.has(toolName));
        if (thawableTools.length === 0 && request.server === undefined) {
            return {
                serverId: this.graph.server.id,
                activatedTools,
                mode: this.#state.mode
            };
        }

        this.#state = {
            serverId: this.graph.server.id,
            mode: 'expanded',
            activeTools: mergeToolNames(this.#state.activeTools, activatedTools)
        };

        return {
            serverId: this.graph.server.id,
            activatedTools,
            mode: this.#state.mode
        };
    }

    #matchTools(request: ExpandRequest): string[] {
        if (request.server !== undefined && request.server !== this.graph.server.id) {
            return [];
        }

        const normalizedRequest = normalizeSearchText(request.request);
        const matches = this.graph.tools
            .filter(tool => {
                const card = this.graph.toolCards[tool.name];
                const haystack = normalizeSearchText(
                    `${tool.name} ${tool.description} ${card?.title ?? ''} ${card?.summary ?? ''} ${(card?.keywords ?? []).join(' ')}`
                );
                return hasSearchOverlap(normalizedRequest, haystack);
            })
            .map(tool => tool.name);

        return matches;
    }
}

function createServerCard(graph: ExposureGraph, mode: ExposureMode): ServerCard {
    return {
        id: graph.server.id,
        title: graph.server.title ?? graph.server.id,
        summary: graph.server.summary,
        mode
    };
}

function createToolIndexEntry(
    serverId: string,
    pinnedToolNames: ReadonlySet<string>,
    toolCards: Readonly<Record<string, ToolCardPolicy>>,
    tool: NativeToolDeclaration
): ToolIndexEntry {
    const card = toolCards[tool.name];

    return {
        id: tool.name,
        title: card?.title ?? tool.name,
        summary: card?.summary ?? tool.description,
        activation: {
            serverId,
            toolName: tool.name
        },
        pinned: pinnedToolNames.has(tool.name)
    };
}

function compareByName(left: NativeToolDeclaration, right: NativeToolDeclaration): number {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function mergeToolNames(current: readonly string[] | undefined, next: readonly string[]): string[] {
    return [...new Set([...(current ?? []), ...next])].toSorted();
}

function normalizeSearchText(value: string): string {
    return value.toLowerCase().replaceAll(/[^\p{L}\p{N}.]+/gu, ' ');
}

function hasSearchOverlap(request: string, haystack: string): boolean {
    const requestTerms = request.split(' ').filter(term => isMeaningfulSearchTerm(term));
    const haystackTerms = haystack.split(' ').filter(term => isMeaningfulSearchTerm(term));

    return requestTerms.some(requestTerm =>
        haystackTerms.some(haystackTerm => requestTerm.includes(haystackTerm) || haystackTerm.includes(requestTerm))
    );
}

function isMeaningfulSearchTerm(term: string): boolean {
    if (term === '') {
        return false;
    }

    return [...term].some(character => (character.codePointAt(0) ?? 0) > 0x7f) || term.length >= 3;
}
