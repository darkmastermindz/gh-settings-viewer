// Hostile inputs for every way outside input reaches the viewer: URL route params, query strings
// (filter, owner), config values, GitHub API response fields rendered in the UI or exported as CSV.

export const ACCOUNT_KEY_PAYLOADS = ['../app', 'acme/../../app', '%2e%2e', 'acme%2Fevil', 'acme?x=1', 'acme#x', '<script>', 'a b', '', '-acme', 'acme-', 'a--b', 'a'.repeat(61), '__proto__', 'constructor\u0000', 'acme\n'];

export const REPO_NAME_PAYLOADS = ['..', '.', '../x', 'a/b', 'a\\b', 'x?y', 'x#y', '<img src=x>', 'a b', '', 'a'.repeat(101), 'name\u0000'];

export const FEATURE_ID_PAYLOADS = ['../org-webhooks', 'ORG-WEBHOOKS', 'org_webhooks', 'org-webhooks?x', '__proto__', 'constructor', 'toString', '', 'a'.repeat(81)];

export const FILTER_PAYLOADS = ['action:repo.create\u0000', 'x\r\nHost: evil', '\u001b[31mred', 'a'.repeat(5000)];

export const CSV_INJECTION_PAYLOADS = ['=HYPERLINK("https://evil.example","x")', '+cmd|/C calc!A0', '-2+3', '@SUM(1+1)', '\t=1+1', '\r=1+1'];

export const HOST_HEADER_PAYLOADS = ['evil.example:4783', '127.0.0.1.evil.example:4783', '127.0.0.1:4784', 'localhost', '', 'LOCALHOST:4783.evil'];

export const ORIGIN_PAYLOADS = ['https://evil.example', 'http://127.0.0.1:4784', 'null', 'http://localhost.evil.example:4783'];

export const API_URL_PAYLOADS = ['http://api.github.com', 'https://token@api.github.com', 'javascript:alert(1)', 'file:///etc/passwd', 'https://api.github.com/?x=1', 'https://api.github.com/#x'];

export const TOKEN_LIKE = ['ghs_AAAAAAAAAAAAAAAAAAAA1234567890abcdef', 'ghp_' + 'B'.repeat(36), 'github_pat_' + 'C'.repeat(40), 'v1.' + 'a'.repeat(40), 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiIxMjMifQ.c2lnbmF0dXJlc2lnbmF0dXJl', '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----'];
