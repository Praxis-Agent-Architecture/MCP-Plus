import type { NativeToolDeclaration } from '@praxis-ai/mcp-plus';

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
        data?: unknown;
    };
};

export function createJsonRpcHandler(runtime: ProxyRuntime): (request: JsonRpcRequest) => Promise<JsonRpcResponse | undefined> {
    return async request => {
        if (request.id === undefined) {
            await runtime.forwardNotification(request.method, request.params);
            return undefined;
        }

        try {
            if (request.method === 'initialize') {
                return success(request.id, await runtime.initialize());
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

            return success(request.id, await runtime.forwardRequest(request.method, request.params));
        } catch (error) {
            return failure(
                request.id,
                getErrorCode(error),
                error instanceof Error ? error.message : String(error),
                getErrorData(error)
            );
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

function failure(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
    const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message
        }
    };

    if (data !== undefined && response.error !== undefined) {
        response.error.data = data;
    }

    return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorCode(error: unknown): number {
    if (isRecord(error) && typeof error.code === 'number' && Number.isSafeInteger(error.code)) {
        return error.code;
    }

    return -32603;
}

function getErrorData(error: unknown): unknown {
    return isRecord(error) ? error.data : undefined;
}
