import type { NativeToolDeclaration } from '@mcp-plus/core';

import type { ProxyRuntime } from './proxyRuntime.js';

export type JsonRpcRequest = {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: unknown;
};

export type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
};

export function createJsonRpcHandler(runtime: ProxyRuntime): (request: JsonRpcRequest) => Promise<JsonRpcResponse | undefined> {
    return async request => {
        if (request.id === undefined) {
            return undefined;
        }

        try {
            if (request.method === 'initialize') {
                await runtime.initialize();
                return success(request.id, {
                    protocolVersion: '2025-06-18',
                    capabilities: {
                        tools: {
                            listChanged: true
                        }
                    },
                    serverInfo: {
                        name: 'mcp-plus-stdio-proxy',
                        version: '0.0.0'
                    }
                });
            }

            if (request.method === 'tools/list') {
                const surface = await runtime.listTools();
                return success(request.id, {
                    tools: surface.tools.map(toMcpTool)
                });
            }

            if (request.method === 'tools/call') {
                const params = normalizeCallToolParams(request.params);
                return success(request.id, await runtime.callTool(params.name, params.arguments));
            }

            return failure(request.id, -32601, `Method not found: ${request.method}`);
        } catch (error) {
            return failure(request.id, -32603, error instanceof Error ? error.message : String(error));
        }
    };
}

function toMcpTool(tool: NativeToolDeclaration): NativeToolDeclaration {
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
    };
}

function normalizeCallToolParams(params: unknown): { name: string; arguments?: unknown } {
    if (!isRecord(params) || typeof params.name !== 'string') {
        throw new Error('tools/call params must include a string name');
    }

    return {
        name: params.name,
        arguments: params.arguments
    };
}

function success(id: string | number, result: unknown): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        result
    };
}

function failure(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message
        }
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
