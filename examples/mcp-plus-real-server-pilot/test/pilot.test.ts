import { describe, expect, test } from 'vitest';

import { createBrowserPilotManifest, runStdioMcpPlusPilot } from '../src/index.js';

describe('MCP+ real server pilot', () => {
    test('reads native tools/list from a real stdio MCP server and folds it into an MCP+ surface', async () => {
        const result = await runStdioMcpPlusPilot({
            command: process.execPath,
            args: ['--import', 'tsx/esm', 'test/fixtures/browserServer.ts'],
            manifest: createBrowserPilotManifest()
        });

        expect(result.nativeToolNames).toEqual([
            'browser.open',
            'console.messages',
            'coverage.report',
            'network.status',
            'page.snapshot'
        ]);
        expect(result.surface.tools.map(tool => tool.name)).toEqual(['browser.open', 'page.snapshot', 'mcp_plus.expand']);
        expect(result.surface.sidecar.toolIndex).toEqual([
            {
                id: 'console.messages',
                title: 'console.messages',
                summary: 'Read browser console messages, warnings, and errors for the current page.',
                activation: {
                    serverId: 'browser-fixture',
                    toolName: 'console.messages'
                },
                pinned: false
            },
            {
                id: 'coverage.report',
                title: 'coverage.report',
                summary: 'Generate a JavaScript and CSS coverage report for the current page.',
                activation: {
                    serverId: 'browser-fixture',
                    toolName: 'coverage.report'
                },
                pinned: false
            },
            {
                id: 'network.status',
                title: 'Network status',
                summary: 'Network diagnostics for the current browser page.',
                activation: {
                    serverId: 'browser-fixture',
                    toolName: 'network.status'
                },
                pinned: false
            }
        ]);
        expect(result.impact.nativeToolCount).toBe(5);
        expect(result.impact.visibleToolCount).toBe(3);
        expect(result.impact.indexedToolCount).toBe(3);
        expect(result.impact.foldedContextCharacters).toBe(result.impact.visibleSchemaCharacters + result.impact.stableIndexCharacters);
        expect(result.impact.schemaCharacterSavings).toBe(result.impact.fullSchemaCharacters - result.impact.foldedContextCharacters);
        expect(result.impact.schemaCharacterSavings).toBeLessThan(0);
        expect(result.impact.indexedActivationTurns).toBe(2);
    });
});
