import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin editorial route security wiring', () => {
  it('mounts the private router only after global CSRF protection', () => {
    const server = readFileSync(join(process.cwd(), 'src', 'server.ts'), 'utf8');
    expect(server.indexOf("app.use('/api', csrfRequired)")).toBeGreaterThan(-1);
    expect(server.indexOf("app.use('/api', adminEditorialRouter)")).toBeGreaterThan(server.indexOf("app.use('/api', csrfRequired)"));
  });

  it('keeps manual publication exclusively under the private admin router', () => {
    const routes = readFileSync(join(process.cwd(), 'src', 'routes', 'admin-editorial.ts'), 'utf8');
    expect(routes).toContain("const root = '/admin/editorial-drafts'");
    expect(routes).toContain('`${root}/:id/revisions/:revisionId/publish`');
    expect(routes).not.toContain("router.post('/articles/");
    expect(routes).not.toContain("router.post('/publish");
    expect(routes).toContain('`${root}/:id/verify`');
  });
});
