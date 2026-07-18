import { describe, expect, it } from 'vitest';
import {
  parseApplicableRules,
  RobotsChecker,
  type RobotsFetcher,
} from '../src/lib/document-corpus/robots.js';

class FakeRobotsFetcher implements RobotsFetcher {
  calls = 0;

  constructor(
    private readonly response: { status: number; body: string } | Error,
  ) {}

  async fetch() {
    this.calls++;
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

describe('document robots policy', () => {
  it('prefers the EpionBot group and applies the longest matching rule', async () => {
    const fetcher = new FakeRobotsFetcher({
      status: 200,
      body: `
User-agent: *
Disallow: /

User-agent: EpionBot
Disallow: /private/
Allow: /private/public/
`,
    });
    const checker = new RobotsChecker(fetcher);

    await expect(checker.check('https://example.com/private/story')).resolves.toMatchObject({
      allowed: false,
      reason: 'robots_disallowed',
    });
    await expect(checker.check('https://example.com/private/public/story')).resolves.toMatchObject({
      allowed: true,
      reason: 'robots_allowed',
    });
    expect(fetcher.calls).toBe(1);
  });

  it('allows a missing robots file and fails closed when robots is unavailable', async () => {
    await expect(new RobotsChecker(new FakeRobotsFetcher({ status: 404, body: '' }))
      .check('https://example.com/news')).resolves.toMatchObject({
      allowed: true,
      reason: 'robots_not_found',
    });
    await expect(new RobotsChecker(new FakeRobotsFetcher(new Error('timeout')))
      .check('https://example.com/news')).resolves.toMatchObject({
      allowed: false,
      retryable: true,
      reason: 'robots_unavailable',
    });
  });

  it('parses wildcard rules when no bot-specific group exists', () => {
    expect(parseApplicableRules('User-agent: *\nDisallow: /drafts', 'EpionBot'))
      .toEqual([{ allow: false, path: '/drafts' }]);
  });
});
