const DOWNSTREAM_ENV_ALLOWLIST = [
    'HOME',
    'LOGNAME',
    'PATH',
    'SHELL',
    'TERM',
    'USER',
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
    'REQUESTS_CA_BUNDLE',
    'CURL_CA_BUNDLE'
];

export function createDownstreamEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
    const env: Record<string, string> = {};

    for (const key of DOWNSTREAM_ENV_ALLOWLIST) {
        const value = source[key];
        if (typeof value === 'string' && value.length > 0) {
            env[key] = value;
        }
    }

    return env;
}
