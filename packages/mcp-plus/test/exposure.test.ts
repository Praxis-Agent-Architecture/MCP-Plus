import { describe, expect, test } from 'vitest';

import type { McpPlusManifest, NativeToolDeclaration } from '../src/index.js';
import {
    compileMcpPlusManifest,
    createExpandToolDeclaration,
    createInitToolDeclaration,
    createLearnedProfileFromProposal,
    createReprofileToolDeclaration,
    defineMcpPlusManifest,
    estimateExposurePlanImpact,
    ExposurePlanner,
    lowerExposurePlanToMcpSurface,
    MCP_PLUS_PROFILE_SCHEMA_VERSION,
    McpPlusWrapperRuntime,
    mergeManifestWithProfileProposal,
    mergeMcpPlusPolicy,
    planExposure,
    validateProfileProposal
} from '../src/index.js';

const nativeTools: NativeToolDeclaration[] = [
    {
        name: 'browser.open',
        description: 'Open the browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string' }
            },
            required: ['url']
        }
    },
    {
        name: 'page.status',
        description: 'Read current page status',
        inputSchema: {
            type: 'object',
            properties: {
                includeNetwork: { type: 'boolean' }
            }
        }
    },
    {
        name: 'network.status',
        description: 'Inspect network status',
        inputSchema: {
            type: 'object',
            properties: {
                verbose: { type: 'boolean' }
            }
        }
    }
];

const manifest: McpPlusManifest = {
    server: {
        id: 'playwright',
        title: 'Playwright MCP',
        summary: 'Browser automation and page inspection.'
    },
    exposure: {
        pinnedTools: ['browser.open'],
        indexedTools: ['network.status'],
        warmTools: ['page.status'],
        toolCards: {
            'network.status': {
                keywords: ['网页网络状态', '网络状态']
            }
        },
        freezeAfterUnusedTurns: 5,
        warmAfterConsecutiveCalls: 2,
        demoteAfterUnusedTurns: 2
    },
    skills: {
        chapters: [
            {
                id: 'page-inspection',
                title: 'Page inspection basics',
                summary: 'Open the page, inspect status, then capture details.'
            }
        ]
    }
};

describe('MCP+ exposure planning', () => {
    test('defines developer-authored manifests without changing their shape', () => {
        const developerManifest = defineMcpPlusManifest({
            server: {
                id: 'custom-plus',
                summary: 'Custom MCP+ wrapper manifest.'
            },
            exposure: {
                pinnedTools: ['search'],
                indexedTools: ['admin']
            }
        });

        expect(compileMcpPlusManifest(developerManifest, nativeTools).server.id).toBe('custom-plus');
        expect(developerManifest.exposure.indexedTools).toEqual(['admin']);
    });

    test('keeps full schema out of the tool index while exposing pinned and warm schemas', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'expanded',
            activeTools: []
        });

        expect(plan.visibleTools.map(tool => tool.name)).toEqual(['browser.open', 'page.status', 'mcp_plus.expand']);
        expect(plan.toolIndex).toEqual([
            {
                id: 'network.status',
                title: 'network.status',
                summary: 'Inspect network status',
                activation: { serverId: 'playwright', toolName: 'network.status' },
                pinned: false
            }
        ]);
        expect(plan.toolIndex[0]).not.toHaveProperty('inputSchema');
    });

    test('activates indexed native schemas after an expansion request', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'expanded',
            activeTools: ['network.status']
        });

        expect(plan.visibleTools.map(tool => tool.name)).toEqual(['browser.open', 'network.status', 'page.status', 'mcp_plus.expand']);
        expect(plan.visibleTools.find(tool => tool.name === 'network.status')?.inputSchema).toEqual(nativeTools[2]?.inputSchema);
    });

    test('freezes the server to a compact card and the expand control tool', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'frozen',
            activeTools: ['network.status']
        });

        expect(plan.visibleTools.map(tool => tool.name)).toEqual(['mcp_plus.expand']);
        expect(plan.serverCard).toEqual({
            id: 'playwright',
            title: 'Playwright MCP',
            summary: 'Browser automation and page inspection.',
            mode: 'frozen'
        });
        expect(plan.toolIndex).toHaveLength(0);
    });

    test('indexes the server without exposing native schemas in indexed mode', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'indexed',
            activeTools: ['network.status']
        });

        expect(plan.visibleTools.map(tool => tool.name)).toEqual(['mcp_plus.expand']);
        expect(plan.toolIndex.map(tool => tool.id)).toEqual(['browser.open', 'network.status', 'page.status']);
        expect(plan.skillIndex.map(skill => skill.id)).toEqual(['page-inspection']);
    });

    test('rejects exposure state for a different server', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);

        expect(() =>
            planExposure(graph, {
                serverId: 'github',
                mode: 'frozen'
            })
        ).toThrow('Exposure state server github does not match graph server playwright');
    });

    test('defines expand as a tiny pinned native MCP control tool', () => {
        expect(createExpandToolDeclaration()).toEqual({
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
        });
    });

    test('defines init and reprofile as standard MCP-shaped profile proposal control tools', () => {
        expect(createInitToolDeclaration()).toMatchObject({
            name: 'mcp_plus.init',
            inputSchema: {
                type: 'object',
                required: ['serverId', 'pinnedTools', 'indexedTools', 'toolCards'],
                additionalProperties: false
            }
        });
        expect(createReprofileToolDeclaration()).toMatchObject({
            name: 'mcp_plus.reprofile',
            inputSchema: {
                type: 'object',
                required: ['serverId', 'pinnedTools', 'indexedTools', 'toolCards'],
                additionalProperties: false
            }
        });
        expect(createInitToolDeclaration().inputSchema.properties).not.toHaveProperty('modeHint');
        expect(createReprofileToolDeclaration().inputSchema.properties).not.toHaveProperty('modeHint');
    });

    test('rejects invalid profile proposals without assuming runtime storage or lifecycle', () => {
        const result = validateProfileProposal(
            {
                serverId: 'playwright',
                pinnedTools: ['network.status', 'missing.tool'],
                indexedTools: ['page.status'],
                alwaysIndexTools: ['network.status'],
                toolCards: {
                    'missing.tool': {
                        summary: 'Invented tool.'
                    }
                },
                modeHint: 'expanded'
            },
            nativeTools,
            {
                serverId: 'playwright'
            }
        );

        expect(result.valid).toBe(false);
        expect(result.issues.map(issue => issue.code)).toEqual([
            'reserved_runtime_field',
            'unknown_tool',
            'always_index_pinned',
            'unknown_tool'
        ]);
    });

    test('accepts valid profile proposals and creates versioned learned profiles', () => {
        const proposal = {
            serverId: 'playwright',
            pinnedTools: ['browser.open'],
            warmTools: ['page.status'],
            indexedTools: ['network.status'],
            toolCards: {
                'network.status': {
                    summary: 'Inspect network diagnostics only when needed.',
                    keywords: ['network', 'diagnostics']
                }
            },
            skillChapters: [
                {
                    id: 'browser-debugging',
                    title: 'Browser debugging',
                    summary: 'Use snapshots first, then expand diagnostics.'
                }
            ]
        };

        expect(validateProfileProposal(proposal, nativeTools, { serverId: 'playwright' })).toEqual({
            valid: true,
            issues: []
        });
        expect(createLearnedProfileFromProposal(proposal)).toEqual({
            schemaVersion: MCP_PLUS_PROFILE_SCHEMA_VERSION,
            serverId: 'playwright',
            pinnedTools: ['browser.open'],
            warmTools: ['page.status'],
            indexedTools: ['network.status'],
            alwaysIndexTools: undefined,
            toolCards: {
                'network.status': {
                    summary: 'Inspect network diagnostics only when needed.',
                    keywords: ['network', 'diagnostics']
                }
            },
            skillChapters: [
                {
                    id: 'browser-debugging',
                    title: 'Browser debugging',
                    summary: 'Use snapshots first, then expand diagnostics.'
                }
            ],
            rationale: undefined
        });
    });

    test('merges manifest, learned profile, and runtime overlay without mutating source manifests', () => {
        const sourceManifest: McpPlusManifest = {
            server: manifest.server,
            exposure: {
                pinnedTools: ['browser.open'],
                alwaysIndexTools: ['network.status'],
                toolCards: {
                    'network.status': {
                        summary: 'Developer-authored network card.'
                    }
                }
            },
            skills: {
                chapters: [
                    {
                        id: 'developer-skill',
                        title: 'Developer skill',
                        summary: 'Developer-authored chapter.'
                    }
                ]
            }
        };
        const before = structuredClone(sourceManifest);
        const proposal = {
            serverId: 'playwright',
            pinnedTools: ['network.status', 'page.status'],
            indexedTools: ['network.status'],
            alwaysIndexTools: ['network.status'],
            toolCards: {
                'page.status': {
                    summary: 'Learned page status card.'
                },
                'network.status': {
                    summary: 'Learned network card should not override developer card.'
                }
            },
            skillChapters: [
                {
                    id: 'learned-skill',
                    title: 'Learned skill',
                    summary: 'Learned chapter.'
                }
            ]
        };
        const merged = mergeManifestWithProfileProposal(sourceManifest, proposal, {
            runtimeOverlay: {
                serverId: 'playwright',
                sessionId: 'session-1',
                exposure: {
                    warmTools: ['page.status']
                },
                state: {
                    mode: 'indexed',
                    activeTools: ['page.status'],
                    pendingReprofile: true
                }
            }
        });

        expect(sourceManifest).toEqual(before);
        expect(merged.exposure?.pinnedTools).toEqual(['browser.open', 'page.status']);
        expect(merged.exposure?.warmTools).toEqual(['page.status']);
        expect(merged.exposure?.alwaysIndexTools).toEqual(['network.status']);
        expect(merged.exposure?.indexedTools).toEqual(['network.status']);
        expect(merged.exposure?.toolCards).toEqual({
            'network.status': {
                summary: 'Developer-authored network card.'
            },
            'page.status': {
                summary: 'Learned page status card.'
            }
        });
        expect(merged.skills?.chapters?.map(chapter => chapter.id)).toEqual(['developer-skill', 'learned-skill']);
    });

    test('rejects learned profile and overlay for other servers during merge', () => {
        expect(() =>
            mergeMcpPlusPolicy({
                manifest,
                learnedProfile: {
                    schemaVersion: MCP_PLUS_PROFILE_SCHEMA_VERSION,
                    serverId: 'github'
                }
            })
        ).toThrow('learnedProfile server github does not match manifest server playwright');
        expect(() =>
            mergeMcpPlusPolicy({
                manifest,
                runtimeOverlay: {
                    serverId: 'github'
                }
            })
        ).toThrow('runtimeOverlay server github does not match manifest server playwright');
    });

    test('lowers exposure plans to an MCP-compatible visible surface with sidecar index metadata', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'expanded',
            activeTools: ['page.status']
        });

        expect(lowerExposurePlanToMcpSurface(plan)).toEqual({
            tools: [nativeTools[0], nativeTools[1], createExpandToolDeclaration()],
            sidecar: {
                serverCard: {
                    id: 'playwright',
                    title: 'Playwright MCP',
                    summary: 'Browser automation and page inspection.',
                    mode: 'expanded'
                },
                toolIndex: [
                    {
                        id: 'network.status',
                        title: 'network.status',
                        summary: 'Inspect network status',
                        activation: { serverId: 'playwright', toolName: 'network.status' },
                        pinned: false
                    }
                ],
                skillIndex: [
                    {
                        id: 'page-inspection',
                        title: 'Page inspection basics',
                        summary: 'Open the page, inspect status, then capture details.',
                        serverId: 'playwright'
                    }
                ]
            }
        });
    });

    test('wrapper runtime activates indexed schemas through expand requests', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const runtime = new McpPlusWrapperRuntime(graph, {
            serverId: 'playwright',
            mode: 'frozen'
        });

        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual(['mcp_plus.expand']);
        expect(
            runtime.expand({
                request: '查看网页网络状态'
            })
        ).toEqual({
            serverId: 'playwright',
            activatedTools: ['network.status'],
            mode: 'expanded'
        });
        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual([
            'browser.open',
            'network.status',
            'page.status',
            'mcp_plus.expand'
        ]);
    });

    test('wrapper runtime ignores expand requests for other servers without thawing', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const runtime = new McpPlusWrapperRuntime(graph, {
            serverId: 'playwright',
            mode: 'frozen'
        });

        expect(
            runtime.expand({
                server: 'github',
                request: '查看 issues'
            })
        ).toEqual({
            serverId: 'playwright',
            activatedTools: [],
            mode: 'frozen'
        });
        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual(['mcp_plus.expand']);
    });

    test('wrapper runtime ignores unmatched global expand requests without thawing', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const runtime = new McpPlusWrapperRuntime(graph, {
            serverId: 'playwright',
            mode: 'frozen'
        });

        expect(
            runtime.expand({
                request: 'create a github issue'
            })
        ).toEqual({
            serverId: 'playwright',
            activatedTools: [],
            mode: 'frozen'
        });
        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual(['mcp_plus.expand']);
    });

    test('wrapper runtime thaws indexed servers when expand matches a pinned tool', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const runtime = new McpPlusWrapperRuntime(graph, {
            serverId: 'playwright',
            mode: 'indexed'
        });

        expect(
            runtime.expand({
                request: 'open browser'
            })
        ).toEqual({
            serverId: 'playwright',
            activatedTools: [],
            mode: 'expanded'
        });
        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual(['browser.open', 'page.status', 'mcp_plus.expand']);
    });

    test('estimates full versus folded exposure impact for token/cache and step comparisons', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'expanded',
            activeTools: []
        });

        expect(estimateExposurePlanImpact(graph, plan)).toEqual({
            nativeToolCount: 3,
            visibleToolCount: 3,
            indexedToolCount: 1,
            fullSchemaCharacters: JSON.stringify(nativeTools.toSorted((left, right) => (left.name < right.name ? -1 : 1))).length,
            visibleSchemaCharacters: JSON.stringify(plan.visibleTools).length,
            foldedContextCharacters: JSON.stringify(plan.visibleTools).length + JSON.stringify(plan.toolIndex).length,
            schemaCharacterSavings:
                JSON.stringify(nativeTools.toSorted((left, right) => (left.name < right.name ? -1 : 1))).length -
                JSON.stringify(plan.visibleTools).length -
                JSON.stringify(plan.toolIndex).length,
            indexedActivationTurns: 2,
            stableIndexCharacters: JSON.stringify(plan.toolIndex).length
        });
    });

    test('keeps always-index tools folded even when runtime state asks to activate them', () => {
        const graph = compileMcpPlusManifest(
            {
                ...manifest,
                exposure: {
                    ...manifest.exposure,
                    alwaysIndexTools: ['network.status']
                }
            },
            nativeTools
        );
        const plan = planExposure(graph, {
            serverId: 'playwright',
            mode: 'expanded',
            activeTools: ['network.status']
        });

        expect(plan.visibleTools.map(tool => tool.name)).toEqual(['browser.open', 'page.status', 'mcp_plus.expand']);
        expect(plan.toolIndex.map(tool => tool.id)).toEqual(['network.status']);
    });

    test('wrapper runtime does not report always-index tools as activated', () => {
        const graph = compileMcpPlusManifest(
            {
                ...manifest,
                exposure: {
                    ...manifest.exposure,
                    alwaysIndexTools: ['network.status']
                }
            },
            nativeTools
        );
        const runtime = new McpPlusWrapperRuntime(graph, {
            serverId: 'playwright',
            mode: 'expanded'
        });

        expect(
            runtime.expand({
                request: '查看网页网络状态'
            })
        ).toEqual({
            serverId: 'playwright',
            activatedTools: [],
            mode: 'expanded'
        });
        expect(runtime.getSurface().tools.map(tool => tool.name)).toEqual(['browser.open', 'page.status', 'mcp_plus.expand']);
    });

    test('exposes ExposurePlanner as the named automatic planner entry point', () => {
        const graph = compileMcpPlusManifest(manifest, nativeTools);
        const planner = new ExposurePlanner(graph);

        expect(
            planner
                .plan({
                    serverId: 'playwright',
                    mode: 'expanded',
                    activeTools: ['page.status']
                })
                .visibleTools.map(tool => tool.name)
        ).toEqual(['browser.open', 'page.status', 'mcp_plus.expand']);
    });
});
