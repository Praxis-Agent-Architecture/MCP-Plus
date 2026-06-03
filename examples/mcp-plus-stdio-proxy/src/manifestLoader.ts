import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import type { McpPlusManifest } from '@praxis-ai/mcp-plus';

import { createPresetManifest, type PresetName } from './presets.js';

export type ManifestSource =
    | {
          preset: PresetName;
          manifestPath?: undefined;
      }
    | {
          preset?: PresetName;
          manifestPath: string;
      };

export async function loadMcpPlusManifest(source: ManifestSource): Promise<McpPlusManifest> {
    if (source.manifestPath === undefined) {
        return createPresetManifest(source.preset);
    }

    const absolutePath = path.resolve(source.manifestPath);
    if (absolutePath.endsWith('.json')) {
        const manifest = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown;
        assertMcpPlusManifest(manifest, absolutePath);
        return manifest;
    }

    const module = (await import(pathToFileURL(absolutePath).href)) as {
        default?: unknown;
        manifest?: unknown;
    };
    const manifest = module.default ?? module.manifest;
    assertMcpPlusManifest(manifest, absolutePath);
    return manifest;
}

function assertMcpPlusManifest(value: unknown, source: string): asserts value is McpPlusManifest {
    if (!isRecord(value) || !isRecord(value.server)) {
        throw new Error(`MCP+ manifest ${source} must export a manifest with a server object`);
    }

    if (typeof value.server.id !== 'string' || typeof value.server.summary !== 'string') {
        throw new Error(`MCP+ manifest ${source} server must include string id and summary fields`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
