import {
    compileMcpPlusManifest,
    lowerExposurePlanToMcpSurface,
    planExposure,
    type NativeToolDeclaration
} from '@praxis-ai/mcp-plus';

import manifest from '../mcp-plus.config.js';

const nativeTools: NativeToolDeclaration[] = [
    {
        name: 'browser.open',
        description: 'Open a browser page with a URL.',
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
        name: 'page.snapshot',
        description: 'Capture a compact accessibility snapshot for the current page.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'network.status',
        description: 'Inspect current browser network status and pending requests.',
        inputSchema: {
            type: 'object',
            properties: {
                includeHeaders: { type: 'boolean' }
            },
            additionalProperties: false
        }
    }
];

const graph = compileMcpPlusManifest(manifest, nativeTools);
const plan = planExposure(graph, {
    serverId: 'browser',
    mode: 'expanded',
    activeTools: []
});

export const visibleSurface = lowerExposurePlanToMcpSurface(plan);
