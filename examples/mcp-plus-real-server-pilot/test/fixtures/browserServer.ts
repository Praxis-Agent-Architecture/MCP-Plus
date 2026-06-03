type JsonRpcRequest = {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: unknown;
};

const tools = [
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
            properties: {},
            additionalProperties: false
        }
    },
    {
        name: 'console.messages',
        description: 'Read browser console messages, warnings, and errors for the current page.',
        inputSchema: {
            type: 'object',
            properties: {
                level: {
                    type: 'string',
                    enum: ['log', 'warning', 'error']
                },
                limit: { type: 'number' }
            },
            additionalProperties: false
        }
    },
    {
        name: 'coverage.report',
        description: 'Generate a JavaScript and CSS coverage report for the current page.',
        inputSchema: {
            type: 'object',
            properties: {
                includeSourceText: { type: 'boolean' },
                format: {
                    type: 'string',
                    enum: ['summary', 'files']
                }
            },
            additionalProperties: false
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
        if (line === '') {
            continue;
        }

        handleRequest(JSON.parse(line) as JsonRpcRequest);
    }
});

function handleRequest(request: JsonRpcRequest): void {
    if (request.id === undefined) {
        return;
    }

    if (request.method === 'initialize') {
        writeResponse(request.id, {
            protocolVersion: '2025-06-18',
            capabilities: {
                tools: {}
            },
            serverInfo: {
                name: 'browser-fixture',
                version: '1.0.0'
            }
        });
        return;
    }

    if (request.method === 'tools/list') {
        writeResponse(request.id, {
            tools
        });
        return;
    }

    writeResponse(request.id, {
        content: [
            {
                type: 'text',
                text: `Unhandled method: ${request.method}`
            }
        ],
        isError: true
    });
}

function writeResponse(id: string | number, result: unknown): void {
    process.stdout.write(
        `${JSON.stringify({
            jsonrpc: '2.0',
            id,
            result
        })}\n`
    );
}
