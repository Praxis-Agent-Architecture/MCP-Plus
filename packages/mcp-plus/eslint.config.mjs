// @ts-check

import baseConfig from '@modelcontextprotocol/eslint-config';

export default [
    ...baseConfig,
    {
        settings: {
            'import/internal-regex': '^@praxis-ai/mcp-plus'
        }
    }
];
