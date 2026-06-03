import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadMcpPlusManifest } from '../src/manifestLoader.js';

describe('MCP+ manifest loader', () => {
    it('loads a built-in preset manifest', async () => {
        const manifest = await loadMcpPlusManifest({ preset: 'playwright' });

        expect(manifest.server.id).toBe('playwright-plus');
        expect(manifest.exposure?.pinnedTools).toContain('browser_navigate');
    });

    it('loads a developer-authored manifest module', async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'mcp-plus-manifest-'));
        const manifestPath = path.join(directory, 'mcp-plus.config.mjs');
        await writeFile(
            manifestPath,
            [
                'export default {',
                '  server: { id: "custom-plus", title: "Custom MCP+", summary: "Custom wrapped server." },',
                '  exposure: { pinnedTools: ["search"], indexedTools: ["admin"] },',
                '  skills: { chapters: [{ id: "search", title: "Search", summary: "Search first." }] }',
                '};'
            ].join('\n')
        );

        const manifest = await loadMcpPlusManifest({ manifestPath });

        expect(manifest).toEqual({
            server: {
                id: 'custom-plus',
                title: 'Custom MCP+',
                summary: 'Custom wrapped server.'
            },
            exposure: {
                pinnedTools: ['search'],
                indexedTools: ['admin']
            },
            skills: {
                chapters: [
                    {
                        id: 'search',
                        title: 'Search',
                        summary: 'Search first.'
                    }
                ]
            }
        });
    });

    it('loads a language-neutral JSON manifest file', async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'mcp-plus-json-manifest-'));
        const manifestPath = path.join(directory, 'mcp-plus.json');
        await writeFile(
            manifestPath,
            JSON.stringify({
                server: {
                    id: 'python-plus',
                    title: 'Python MCP+',
                    summary: 'Language-neutral MCP+ sidecar.'
                },
                exposure: {
                    pinnedTools: ['read'],
                    indexedTools: ['write']
                }
            })
        );

        const manifest = await loadMcpPlusManifest({ manifestPath });

        expect(manifest.server.id).toBe('python-plus');
        expect(manifest.exposure?.pinnedTools).toEqual(['read']);
        expect(manifest.exposure?.indexedTools).toEqual(['write']);
    });
});
