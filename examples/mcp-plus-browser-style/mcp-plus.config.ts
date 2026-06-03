import { defineMcpPlusManifest } from '@praxis-ai/mcp-plus';

export default defineMcpPlusManifest({
    server: {
        id: 'browser',
        title: 'Browser MCP',
        summary: 'Browser automation with folded low-frequency diagnostics.'
    },
    exposure: {
        pinnedTools: ['browser.open', 'page.snapshot'],
        indexedTools: ['network.status'],
        toolCards: {
            'network.status': {
                summary: 'Network diagnostics for the current browser page.',
                keywords: ['network status', '网页网络状态']
            }
        },
        warmAfterConsecutiveCalls: 2,
        demoteAfterUnusedTurns: 2,
        freezeAfterUnusedTurns: 5
    },
    skills: {
        storage: '.mcp-plus/skills/browser',
        chapters: [
            {
                id: 'page-inspection',
                title: 'Page inspection basics',
                summary: 'Open the page, snapshot it, then expand diagnostics only when needed.'
            }
        ]
    }
});
