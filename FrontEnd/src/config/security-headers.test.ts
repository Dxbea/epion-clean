import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as {
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
};

function getHeaderValue(name: string): string {
  const headers = vercelConfig.headers?.[0]?.headers ?? [];
  return headers.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value ?? '';
}

describe('frontend security headers', () => {
  it('applies report-only CSP to the Vercel-served React app', () => {
    const csp = getHeaderValue('Content-Security-Policy-Report-Only');

    expect(vercelConfig.headers?.[0]?.source).toBe('/(.*)');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('does not allow inline scripts and keeps data/blob scoped to images/workers', () => {
    const csp = getHeaderValue('Content-Security-Policy-Report-Only');
    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? '';
    const fontSrc = csp.match(/font-src ([^;]+)/)?.[1] ?? '';
    const mediaSrc = csp.match(/media-src ([^;]+)/)?.[1] ?? '';
    const imgSrc = csp.match(/img-src ([^;]+)/)?.[1] ?? '';
    const workerSrc = csp.match(/worker-src ([^;]+)/)?.[1] ?? '';

    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(fontSrc).not.toContain('data:');
    expect(mediaSrc).not.toContain('data:');
    expect(mediaSrc).not.toContain('blob:');
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
    expect(workerSrc).toContain('blob:');
  });
});

