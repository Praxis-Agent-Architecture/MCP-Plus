import type { McpPlusManifest } from '@mcp-plus/core';

export type PresetName = 'playwright' | 'chrome-devtools' | 'github';

export function createPresetManifest(name: PresetName): McpPlusManifest {
    if (name === 'chrome-devtools') {
        return {
            server: {
                id: 'chrome-devtools-plus',
                title: 'Chrome DevTools MCP+',
                summary: 'Chrome browser inspection with folded low-frequency debugging tools.'
            },
            exposure: {
                pinnedTools: ['new_page', 'navigate_page', 'take_snapshot', 'click', 'fill'],
                toolCards: {
                    list_network_requests: {
                        summary: 'Inspect network requests only when diagnosing loading or API behavior.',
                        keywords: ['network requests', 'headers', 'status', '网络请求']
                    },
                    performance_start_trace: {
                        summary: 'Start performance tracing for advanced page performance diagnosis.',
                        keywords: ['performance', 'trace', '性能']
                    }
                }
            },
            skills: {
                chapters: [
                    {
                        id: 'page-inspection',
                        title: 'Page inspection',
                        summary: 'Open or select a page, snapshot it, then expand diagnostics only when needed.'
                    }
                ]
            }
        };
    }

    if (name === 'github') {
        return {
            server: {
                id: 'github-plus',
                title: 'GitHub MCP+',
                summary: 'GitHub repository operations with folded write and administration capabilities.'
            },
            exposure: {
                pinnedTools: [
                    'search_repositories',
                    'get_file_contents',
                    'list_issues',
                    'search_issues',
                    'list_pull_requests',
                    'get_pull_request',
                    'get_pull_request_files'
                ],
                toolCards: {
                    create_issue: {
                        summary: 'Create an issue when the task explicitly asks for a write operation.',
                        keywords: ['create issue', 'open issue', '写 issue']
                    },
                    create_pull_request: {
                        summary: 'Create a pull request only after code changes are ready.',
                        keywords: ['pull request', 'PR', 'create pr']
                    }
                }
            },
            skills: {
                chapters: [
                    {
                        id: 'readonly-first',
                        title: 'Read-only first',
                        summary: 'Prefer repository discovery and file reads before expanding write tools.'
                    }
                ]
            }
        };
    }

    return {
        server: {
            id: 'playwright-plus',
            title: 'Playwright MCP+',
            summary: 'Browser automation with folded lower-frequency capabilities.'
        },
        exposure: {
            pinnedTools: ['browser_navigate', 'browser_snapshot'],
            toolCards: {
                browser_network_requests: {
                    summary: 'Inspect network requests when page loading, redirects, or API calls matter.',
                    keywords: ['network requests', 'headers', 'status', '网络请求']
                },
                browser_console_messages: {
                    summary: 'Read console messages when debugging page errors or warnings.',
                    keywords: ['console', 'errors', 'warnings', '控制台']
                },
                browser_evaluate: {
                    summary: 'Evaluate JavaScript when the snapshot is insufficient.',
                    keywords: ['javascript', 'evaluate', 'DOM']
                }
            },
            warmAfterConsecutiveCalls: 2,
            demoteAfterUnusedTurns: 2,
            freezeAfterUnusedTurns: 5
        },
        skills: {
            chapters: [
                {
                    id: 'basic-page-read',
                    title: 'Basic page read',
                    summary: 'Navigate to the URL, take a snapshot, and expand diagnostics only when the page state is insufficient.'
                }
            ]
        }
    };
}
