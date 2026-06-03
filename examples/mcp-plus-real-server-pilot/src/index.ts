import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Tool } from '@modelcontextprotocol/client';
import {
    compileMcpPlusManifest,
    estimateExposurePlanImpact,
    lowerExposurePlanToMcpSurface,
    planExposure,
    type ExposureImpactEstimate,
    type McpCompatibleSurface,
    type McpPlusManifest,
    type NativeToolDeclaration
} from '@praxis-ai/mcp-plus';

export type StdioMcpPlusPilotOptions = {
    command: string;
    args?: string[];
    manifest: McpPlusManifest;
};

export type StdioMcpPlusPilotResult = {
    nativeToolNames: string[];
    surface: McpCompatibleSurface;
    impact: ExposureImpactEstimate;
};

export function createBrowserPilotManifest(): McpPlusManifest {
    return {
        server: {
            id: 'browser-fixture',
            title: 'Browser Fixture MCP',
            summary: 'Browser automation fixture for MCP+ exposure experiments.'
        },
        exposure: {
            pinnedTools: ['browser.open', 'page.snapshot'],
            indexedTools: ['network.status'],
            toolCards: {
                'network.status': {
                    title: 'Network status',
                    summary: 'Network diagnostics for the current browser page.',
                    keywords: ['network status', '网页网络状态']
                }
            },
            warmAfterConsecutiveCalls: 2,
            demoteAfterUnusedTurns: 2,
            freezeAfterUnusedTurns: 5
        },
        skills: {
            chapters: [
                {
                    id: 'page-inspection',
                    title: 'Page inspection basics',
                    summary: 'Open the page, snapshot it, then expand diagnostics only when needed.'
                }
            ]
        }
    };
}

export async function runStdioMcpPlusPilot(options: StdioMcpPlusPilotOptions): Promise<StdioMcpPlusPilotResult> {
    const client = new Client({ name: 'mcp-plus-real-server-pilot', version: '0.0.0' });
    const transport = new StdioClientTransport({
        command: options.command,
        args: options.args ?? []
    });

    try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        const nativeTools = tools.map(toNativeToolDeclaration);
        const graph = compileMcpPlusManifest(options.manifest, nativeTools);
        const plan = planExposure(graph, {
            serverId: options.manifest.server.id,
            mode: 'expanded',
            activeTools: []
        });

        return {
            nativeToolNames: nativeTools.map(tool => tool.name).toSorted(),
            surface: lowerExposurePlanToMcpSurface(plan),
            impact: estimateExposurePlanImpact(graph, plan)
        };
    } finally {
        await client.close();
    }
}

function toNativeToolDeclaration(tool: Tool): NativeToolDeclaration {
    return {
        name: tool.name,
        description: tool.description ?? tool.title ?? tool.name,
        inputSchema: tool.inputSchema as NativeToolDeclaration['inputSchema']
    };
}
