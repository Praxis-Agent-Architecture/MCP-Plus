import { describe, expect, it } from 'vitest';

import { createDownstreamEnvironment } from '../src/stdioEnv.js';

describe('stdio downstream environment', () => {
    it('passes GitHub token and proxy env to downstream MCP servers', () => {
        const env = createDownstreamEnvironment({
            HOME: '/home/test',
            PATH: '/bin',
            GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
            HTTPS_PROXY: 'http://127.0.0.1:18888',
            SSL_CERT_FILE: '/tmp/ca.pem',
            UNRELATED_SECRET: 'do-not-pass'
        });

        expect(env).toEqual({
            HOME: '/home/test',
            PATH: '/bin',
            GITHUB_PERSONAL_ACCESS_TOKEN: 'token',
            HTTPS_PROXY: 'http://127.0.0.1:18888',
            SSL_CERT_FILE: '/tmp/ca.pem'
        });
    });
});
