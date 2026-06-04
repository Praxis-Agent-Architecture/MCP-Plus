export type JsonSchema = {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean | JsonSchema;
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

export function defineMcpPlusManifest<const TManifest extends McpPlusManifest>(manifest: TManifest): TManifest {
    return manifest;
}

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
    whenToUse?: string;
    why?: string;
    pitfallsPreview?: string[];
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

export const MCP_PLUS_PROFILE_SCHEMA_VERSION = 'mcp-plus.profile.v1' as const;

export type McpPlusProfileSchemaVersion = typeof MCP_PLUS_PROFILE_SCHEMA_VERSION;

export type McpPlusProfileToolCard = {
    title?: string;
    summary: string;
    keywords?: string[];
};

export type McpPlusProfileProposal = {
    serverId: string;
    pinnedTools: string[];
    warmTools?: string[];
    indexedTools: string[];
    alwaysIndexTools?: string[];
    toolCards: Record<string, McpPlusProfileToolCard>;
    skillChapters?: McpPlusSkillChapter[];
    rationale?: Record<string, string>;
    modeHint?: never;
};

export type McpPlusLearnedProfile = {
    schemaVersion: McpPlusProfileSchemaVersion;
    serverId: string;
    pinnedTools?: string[];
    warmTools?: string[];
    indexedTools?: string[];
    alwaysIndexTools?: string[];
    toolCards?: Record<string, McpPlusProfileToolCard>;
    skillChapters?: McpPlusSkillChapter[];
    rationale?: Record<string, string>;
};

export type McpPlusRuntimeOverlay = {
    serverId: string;
    sessionId?: string;
    exposure?: McpPlusExposurePolicy;
    skills?: McpPlusSkillPolicy;
    state?: {
        mode?: ExposureMode;
        activeTools?: string[];
        pendingReprofile?: boolean;
        counters?: Record<string, number>;
    };
};

export type ProfileProposalValidationIssueCode =
    | 'invalid_shape'
    | 'server_mismatch'
    | 'unknown_tool'
    | 'always_index_pinned'
    | 'invalid_tool_card'
    | 'invalid_skill_chapter'
    | 'reserved_runtime_field';

export type ProfileProposalValidationIssue = {
    code: ProfileProposalValidationIssueCode;
    message: string;
    path: string;
    toolName?: string;
};

export type ProfileProposalValidationOptions = {
    serverId?: string;
    alwaysIndexTools?: readonly string[];
};

export type ProfileProposalValidationResult = {
    valid: boolean;
    issues: ProfileProposalValidationIssue[];
};

export type MergeMcpPlusPolicyInput = {
    manifest: McpPlusManifest;
    learnedProfile?: McpPlusLearnedProfile;
    runtimeOverlay?: McpPlusRuntimeOverlay;
};

const DEFAULT_FREEZE_AFTER_UNUSED_TURNS = 5;
const DEFAULT_WARM_AFTER_CONSECUTIVE_CALLS = 2;
const DEFAULT_DEMOTE_AFTER_UNUSED_TURNS = 2;

export function createInitToolDeclaration(): NativeToolDeclaration {
    return {
        name: 'mcp_plus.init',
        description: [
            'Submit an initial MCP+ exposure profile proposal for this standard MCP server.',
            'Use only tool names from the current tools/list result.',
            'Do not include runtime exposure mode; expanded/indexed/frozen is host-owned session state.'
        ].join(' '),
        inputSchema: createProfileProposalInputSchema('Initial profile proposal to validate.')
    };
}

export function createReprofileToolDeclaration(): NativeToolDeclaration {
    return {
        name: 'mcp_plus.reprofile',
        description: [
            'Submit an updated MCP+ exposure profile proposal after host-selected reprofile.',
            'Use only tool names from the current tools/list result.',
            'This is a proposal only; the host decides whether to accept, merge, and persist it.'
        ].join(' '),
        inputSchema: createProfileProposalInputSchema('Updated profile proposal to validate.')
    };
}

export function validateProfileProposal(
    proposal: unknown,
    nativeTools: readonly NativeToolDeclaration[],
    options: ProfileProposalValidationOptions = {}
): ProfileProposalValidationResult {
    const issues: ProfileProposalValidationIssue[] = [];
    const knownToolNames = new Set(nativeTools.map(tool => tool.name));

    if (!isRecord(proposal)) {
        return {
            valid: false,
            issues: [
                {
                    code: 'invalid_shape',
                    message: 'Profile proposal must be an object.',
                    path: '$'
                }
            ]
        };
    }

    if ('modeHint' in proposal) {
        issues.push({
            code: 'reserved_runtime_field',
            message: 'modeHint is runtime overlay state and is not allowed in McpPlusProfileProposal v1.',
            path: '$.modeHint'
        });
    }

    if (!isString(proposal.serverId)) {
        issues.push({
            code: 'invalid_shape',
            message: 'serverId must be a string.',
            path: '$.serverId'
        });
    } else if (options.serverId !== undefined && proposal.serverId !== options.serverId) {
        issues.push({
            code: 'server_mismatch',
            message: `Profile proposal serverId ${proposal.serverId} does not match expected server ${options.serverId}.`,
            path: '$.serverId'
        });
    }

    const pinnedTools = readStringArray(proposal, 'pinnedTools', issues, true);
    const warmTools = readStringArray(proposal, 'warmTools', issues, false);
    const indexedTools = readStringArray(proposal, 'indexedTools', issues, true);
    const alwaysIndexTools = readStringArray(proposal, 'alwaysIndexTools', issues, false);
    const protectedAlwaysIndexTools = new Set([...(options.alwaysIndexTools ?? []), ...alwaysIndexTools]);

    validateToolNames(pinnedTools, knownToolNames, issues, '$.pinnedTools');
    validateToolNames(warmTools, knownToolNames, issues, '$.warmTools');
    validateToolNames(indexedTools, knownToolNames, issues, '$.indexedTools');
    validateToolNames(alwaysIndexTools, knownToolNames, issues, '$.alwaysIndexTools');

    for (const toolName of pinnedTools) {
        if (protectedAlwaysIndexTools.has(toolName)) {
            issues.push({
                code: 'always_index_pinned',
                message: `Tool ${toolName} is always-index and cannot be pinned by a profile proposal.`,
                path: '$.pinnedTools',
                toolName
            });
        }
    }

    validateToolCards(proposal.toolCards, knownToolNames, issues);
    validateSkillChapters(proposal.skillChapters, issues);

    return {
        valid: issues.length === 0,
        issues
    };
}

export function normalizeProfileProposal(proposal: McpPlusProfileProposal): McpPlusProfileProposal {
    return {
        serverId: proposal.serverId,
        pinnedTools: uniqueSorted(proposal.pinnedTools),
        warmTools: optionalUniqueSorted(proposal.warmTools),
        indexedTools: uniqueSorted(proposal.indexedTools),
        alwaysIndexTools: optionalUniqueSorted(proposal.alwaysIndexTools),
        toolCards: cloneToolCards(proposal.toolCards),
        skillChapters: proposal.skillChapters?.map(chapter => ({ ...chapter })),
        rationale: proposal.rationale === undefined ? undefined : { ...proposal.rationale }
    };
}

export function createLearnedProfileFromProposal(proposal: McpPlusProfileProposal): McpPlusLearnedProfile {
    const normalized = normalizeProfileProposal(proposal);

    return {
        schemaVersion: MCP_PLUS_PROFILE_SCHEMA_VERSION,
        serverId: normalized.serverId,
        pinnedTools: normalized.pinnedTools,
        warmTools: normalized.warmTools,
        indexedTools: normalized.indexedTools,
        alwaysIndexTools: normalized.alwaysIndexTools,
        toolCards: normalized.toolCards,
        skillChapters: normalized.skillChapters,
        rationale: normalized.rationale
    };
}

export function mergeManifestWithProfileProposal(
    manifest: McpPlusManifest,
    proposal: McpPlusProfileProposal,
    options: { runtimeOverlay?: McpPlusRuntimeOverlay } = {}
): McpPlusManifest {
    return mergeMcpPlusPolicy({
        manifest,
        learnedProfile: createLearnedProfileFromProposal(proposal),
        runtimeOverlay: options.runtimeOverlay
    });
}

export function mergeMcpPlusPolicy(input: MergeMcpPlusPolicyInput): McpPlusManifest {
    const manifest = input.manifest;
    const learnedProfile = input.learnedProfile;
    const runtimeOverlay = input.runtimeOverlay;
    const manifestExposure = manifest.exposure ?? {};
    const overlayExposure = runtimeOverlay?.exposure ?? {};

    assertProfileServerMatchesManifest(manifest, learnedProfile, 'learnedProfile');
    assertOverlayServerMatchesManifest(manifest, runtimeOverlay);

    const alwaysIndexTools = uniqueSorted([
        ...(manifestExposure.alwaysIndexTools ?? []),
        ...(learnedProfile?.alwaysIndexTools ?? []),
        ...(overlayExposure.alwaysIndexTools ?? [])
    ]);
    const alwaysIndexToolSet = new Set(alwaysIndexTools);
    const pinnedTools = uniqueSorted([
        ...(manifestExposure.pinnedTools ?? []),
        ...(learnedProfile?.pinnedTools ?? []).filter(toolName => !alwaysIndexToolSet.has(toolName)),
        ...(overlayExposure.pinnedTools ?? []).filter(toolName => !alwaysIndexToolSet.has(toolName))
    ]);
    const warmTools = uniqueSorted([
        ...(manifestExposure.warmTools ?? []),
        ...(learnedProfile?.warmTools ?? []).filter(toolName => !alwaysIndexToolSet.has(toolName)),
        ...(overlayExposure.warmTools ?? []).filter(toolName => !alwaysIndexToolSet.has(toolName))
    ]);
    const indexedTools = uniqueSorted([
        ...(manifestExposure.indexedTools ?? []),
        ...(learnedProfile?.indexedTools ?? []),
        ...(overlayExposure.indexedTools ?? []),
        ...alwaysIndexTools
    ]);
    const toolCards: Record<string, McpPlusProfileToolCard> = Object.assign(
        {},
        learnedProfile?.toolCards,
        manifestExposure.toolCards,
        overlayExposure.toolCards
    );
    const skillChapters = mergeSkillChapters(learnedProfile?.skillChapters, manifest.skills?.chapters, runtimeOverlay?.skills?.chapters);

    return {
        server: { ...manifest.server },
        exposure: {
            ...manifestExposure,
            ...overlayExposure,
            pinnedTools,
            warmTools,
            indexedTools,
            alwaysIndexTools,
            toolCards
        },
        skills:
            manifest.skills === undefined && runtimeOverlay?.skills === undefined && skillChapters.length === 0
                ? undefined
                : Object.assign({}, manifest.skills, runtimeOverlay?.skills, { chapters: skillChapters })
    };
}

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

function createProfileProposalInputSchema(description: string): JsonSchema {
    return {
        type: 'object',
        description,
        properties: {
            serverId: {
                type: 'string',
                description: 'MCP server id this proposal applies to.'
            },
            pinnedTools: {
                type: 'array',
                description: 'Tool names to keep visible as full schemas when the server is expanded.',
                items: { type: 'string' }
            },
            warmTools: {
                type: 'array',
                description: 'Tool names that may stay visible initially, subject to host-owned demotion policy.',
                items: { type: 'string' }
            },
            indexedTools: {
                type: 'array',
                description: 'Tool names represented by compact capability cards until activated.',
                items: { type: 'string' }
            },
            alwaysIndexTools: {
                type: 'array',
                description: 'Tool names that should remain indexed and must not be automatically pinned.',
                items: { type: 'string' }
            },
            toolCards: {
                type: 'object',
                description: 'Compact capability cards keyed by tool name.',
                additionalProperties: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        summary: { type: 'string' },
                        keywords: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    required: ['summary'],
                    additionalProperties: false
                }
            },
            skillChapters: {
                type: 'array',
                description: 'Initial compact server-bound skill chapters.',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        summary: { type: 'string' }
                    },
                    required: ['id', 'title', 'summary'],
                    additionalProperties: false
                }
            },
            rationale: {
                type: 'object',
                description: 'Optional short rationale keyed by tool name or policy area.',
                additionalProperties: { type: 'string' }
            }
        },
        required: ['serverId', 'pinnedTools', 'indexedTools', 'toolCards'],
        additionalProperties: false
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function readStringArray(
    object: Record<string, unknown>,
    key: string,
    issues: ProfileProposalValidationIssue[],
    required: boolean
): string[] {
    const value = object[key];
    if (value === undefined) {
        if (required) {
            issues.push({
                code: 'invalid_shape',
                message: `${key} must be an array of strings.`,
                path: `$.${key}`
            });
        }
        return [];
    }

    if (!Array.isArray(value) || !value.every(item => isString(item))) {
        issues.push({
            code: 'invalid_shape',
            message: `${key} must be an array of strings.`,
            path: `$.${key}`
        });
        return [];
    }

    return value;
}

function validateToolNames(
    toolNames: readonly string[],
    knownToolNames: ReadonlySet<string>,
    issues: ProfileProposalValidationIssue[],
    path: string
): void {
    for (const toolName of toolNames) {
        if (!knownToolNames.has(toolName)) {
            issues.push({
                code: 'unknown_tool',
                message: `Unknown MCP tool name ${toolName}.`,
                path,
                toolName
            });
        }
    }
}

function validateToolCards(value: unknown, knownToolNames: ReadonlySet<string>, issues: ProfileProposalValidationIssue[]): void {
    if (!isRecord(value)) {
        issues.push({
            code: 'invalid_tool_card',
            message: 'toolCards must be an object keyed by tool name.',
            path: '$.toolCards'
        });
        return;
    }

    for (const [toolName, card] of Object.entries(value)) {
        if (!knownToolNames.has(toolName)) {
            issues.push({
                code: 'unknown_tool',
                message: `toolCards references unknown MCP tool name ${toolName}.`,
                path: `$.toolCards.${toolName}`,
                toolName
            });
        }

        if (!isRecord(card) || !isString(card.summary)) {
            issues.push({
                code: 'invalid_tool_card',
                message: `toolCards.${toolName} must include a string summary.`,
                path: `$.toolCards.${toolName}`,
                toolName
            });
            continue;
        }

        if (card.title !== undefined && !isString(card.title)) {
            issues.push({
                code: 'invalid_tool_card',
                message: `toolCards.${toolName}.title must be a string when provided.`,
                path: `$.toolCards.${toolName}.title`,
                toolName
            });
        }

        if (card.keywords !== undefined && (!Array.isArray(card.keywords) || !card.keywords.every(keyword => isString(keyword)))) {
            issues.push({
                code: 'invalid_tool_card',
                message: `toolCards.${toolName}.keywords must be an array of strings when provided.`,
                path: `$.toolCards.${toolName}.keywords`,
                toolName
            });
        }
    }
}

function validateSkillChapters(value: unknown, issues: ProfileProposalValidationIssue[]): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        issues.push({
            code: 'invalid_skill_chapter',
            message: 'skillChapters must be an array when provided.',
            path: '$.skillChapters'
        });
        return;
    }

    for (const [index, chapter] of value.entries()) {
        if (!isRecord(chapter) || !isString(chapter.id) || !isString(chapter.title) || !isString(chapter.summary)) {
            issues.push({
                code: 'invalid_skill_chapter',
                message: 'Each skill chapter must include string id, title, and summary.',
                path: `$.skillChapters.${index}`
            });
        }
    }
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].toSorted();
}

function optionalUniqueSorted(values: readonly string[] | undefined): string[] | undefined {
    return values === undefined ? undefined : uniqueSorted(values);
}

function cloneToolCards(cards: Record<string, McpPlusProfileToolCard>): Record<string, McpPlusProfileToolCard> {
    return Object.fromEntries(
        Object.entries(cards)
            .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([toolName, card]) => [
                toolName,
                {
                    ...card,
                    keywords: card.keywords === undefined ? undefined : [...card.keywords]
                }
            ])
    );
}

function assertProfileServerMatchesManifest(
    manifest: McpPlusManifest,
    learnedProfile: McpPlusLearnedProfile | undefined,
    label: string
): void {
    if (learnedProfile !== undefined && learnedProfile.serverId !== manifest.server.id) {
        throw new Error(`${label} server ${learnedProfile.serverId} does not match manifest server ${manifest.server.id}`);
    }
}

function assertOverlayServerMatchesManifest(manifest: McpPlusManifest, runtimeOverlay: McpPlusRuntimeOverlay | undefined): void {
    if (runtimeOverlay !== undefined && runtimeOverlay.serverId !== manifest.server.id) {
        throw new Error(`runtimeOverlay server ${runtimeOverlay.serverId} does not match manifest server ${manifest.server.id}`);
    }
}

function mergeSkillChapters(
    learnedChapters: readonly McpPlusSkillChapter[] | undefined,
    manifestChapters: readonly McpPlusSkillChapter[] | undefined,
    overlayChapters: readonly McpPlusSkillChapter[] | undefined
): McpPlusSkillChapter[] {
    const chapters = new Map<string, McpPlusSkillChapter>();

    for (const chapter of [...(learnedChapters ?? []), ...(manifestChapters ?? []), ...(overlayChapters ?? [])]) {
        chapters.set(chapter.id, { ...chapter });
    }

    return [...chapters.values()].toSorted((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
