import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin editorial route security wiring', () => {
  it('mounts the private router only after global CSRF protection', () => {
    const server = readFileSync(join(process.cwd(), 'src', 'server.ts'), 'utf8');
    expect(server.indexOf("app.use('/api', csrfRequired)")).toBeGreaterThan(-1);
    expect(server.indexOf("app.use('/api', adminEditorialRouter)")).toBeGreaterThan(server.indexOf("app.use('/api', csrfRequired)"));
    expect(server.indexOf("app.use('/api', adminEditorialOpsRouter)")).toBeGreaterThan(server.indexOf("app.use('/api', csrfRequired)"));
  });

  it('keeps manual publication exclusively under the private admin router', () => {
    const routes = readFileSync(join(process.cwd(), 'src', 'routes', 'admin-editorial.ts'), 'utf8');
    expect(routes).toContain("const root = '/admin/editorial-drafts'");
    expect(routes).toContain('`${root}/:id/revisions/:revisionId/publish`');
    expect(routes).not.toContain("router.post('/articles/");
    expect(routes).not.toContain("router.post('/publish");
    expect(routes).toContain('`${root}/:id/verify`');
  });

  it('keeps shadow operations private and contains no automatic publication route', () => {
    const routes = readFileSync(join(process.cwd(), 'src', 'routes', 'admin-editorial-ops.ts'), 'utf8');
    expect(routes).toContain("const root = '/admin/editorial-ops'");
    expect(routes).toContain('requireEditorialOpsAdmin');
    expect(routes).toContain('mode: \'SHADOW_ONLY\'');
    expect(routes).not.toContain('/publish');
    expect(routes).not.toContain('publishEditorialArticle');
  });
});
