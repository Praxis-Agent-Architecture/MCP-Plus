#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Tool } from '@modelcontextprotocol/client';

import { createJsonRpcHandler, type JsonRpcRequest } from './jsonRpcServer.js';
import { createPresetManifest, type PresetName } from './presets.js';
import { createProxyRuntime } from './proxyRuntime.js';
import type { NativeToolDeclaration } from '@mcp-plus/core';
import { createDownstreamEnvironment } from './stdioEnv.js';
import { createFileSkillStore } from './skillStore.js';

const parsed = parseArgs(process.argv.slice(2));
const client = new Client({ name: 'mcp-plus-stdio-proxy-downstream', version: '0.0.0' });
const transport = new StdioClientTransport({
    command: parsed.command,
    args: parsed.args,
    env: createDownstreamEnvironment(process.env)
});

await client.connect(transport);

const runtime = createProxyRuntime({
    manifest: createPresetManifest(parsed.preset),
    skillStore: createFileSkillStore(resolveSkillDirectory()),
    downstream: {
        async listTools() {
            const result = await client.listTools();
            return {
                tools: result.tools.map(toNativeToolDeclaration)
            };
        },
        async callTool(params) {
            return client.callTool(params as Parameters<Client['callTool']>[0]);
        }
    }
});
const handle = createJsonRpcHandler(runtime);

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
    buffer += chunk;

    while (true) {
        const index = buffer.indexOf('\n');
        if (index === -1) {
            return;
        }

        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.length === 0) {
            continue;
        }

        void handleLine(line);
    }
});

process.on('SIGTERM', () => {
    void closeAndExit();
});
process.on('SIGINT', () => {
    void closeAndExit();
});

async function handleLine(line: string): Promise<void> {
    try {
        const response = await handle(JSON.parse(line) as JsonRpcRequest);
        if (response !== undefined) {
            process.stdout.write(`${JSON.stringify(response)}\n`);
        }
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: error instanceof Error ? error.message : String(error)
                }
            })}\n`
        );
    }
}

async function closeAndExit(): Promise<void> {
    await client.close();
    process.exit(0);
}

function parseArgs(args: string[]): { preset: PresetName; command: string; args: string[] } {
    let preset: PresetName = 'playwright';
    const separatorIndex = args.indexOf('--');
    if (separatorIndex === -1 || separatorIndex === args.length - 1) {
        throw new Error('Usage: stdio.ts [--preset playwright|chrome-devtools|github] -- <downstream-command> [...args]');
    }

    for (let index = 0; index < separatorIndex; index += 1) {
        if (args[index] === '--preset') {
            preset = parsePreset(args[index + 1]);
            index += 1;
        }
    }

    const commandParts = args.slice(separatorIndex + 1);
    return {
        preset,
        command: commandParts[0]!,
        args: commandParts.slice(1)
    };
}

function parsePreset(value: string | undefined): PresetName {
    if (value === 'playwright' || value === 'chrome-devtools' || value === 'github') {
        return value;
    }

    throw new Error(`Unknown MCP+ preset: ${value ?? '<missing>'}`);
}

function resolveSkillDirectory(): string {
    return process.env.MCP_PLUS_SKILL_DIR ?? `${process.env.CODEX_HOME ?? process.cwd()}/mcp-plus-skills`;
}

function toNativeToolDeclaration(tool: Tool): NativeToolDeclaration {
    return {
        name: tool.name,
        description: tool.description ?? tool.title ?? tool.name,
        inputSchema: tool.inputSchema as NativeToolDeclaration['inputSchema']
    };
}
