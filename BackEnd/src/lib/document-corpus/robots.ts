import axios from 'axios';

const ROBOTS_TIMEOUT_MS = 5_000;
const MAX_ROBOTS_BYTES = 512_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;

export interface RobotsHttpResponse {
  status: number;
  body: string;
}

export interface RobotsFetcher {
  fetch(url: string, signal?: AbortSignal): Promise<RobotsHttpResponse>;
}

export interface RobotsDecision {
  allowed: boolean;
  retryable: boolean;
  checkedAt: Date;
  reason: string;
  robotsUrl: string;
}

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface CachedRobots {
  expiresAt: number;
  response: RobotsHttpResponse;
}

export class RobotsChecker {
  private readonly cache = new Map<string, CachedRobots>();

  constructor(
    private readonly fetcher: RobotsFetcher = new AxiosRobotsFetcher(),
    private readonly userAgent = 'EpionBot',
  ) {}

  async check(url: string, signal?: AbortSignal, now = new Date()): Promise<RobotsDecision> {
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return decision(false, false, now, 'unsupported_protocol', '');
    }

    const robotsUrl = `${target.origin}/robots.txt`;
    let response = this.readCache(robotsUrl, now);

    if (!response) {
      try {
        response = await this.fetcher.fetch(robotsUrl, signal);
        if (response.body.length > MAX_ROBOTS_BYTES) {
          return decision(false, false, now, 'robots_file_too_large', robotsUrl);
        }
        this.cache.set(robotsUrl, {
          response,
          expiresAt: now.getTime() + CACHE_TTL_MS,
        });
      } catch {
        return decision(false, true, now, 'robots_unavailable', robotsUrl);
      }
    }

    if (response.status === 404 || response.status === 410) {
      return decision(true, false, now, 'robots_not_found', robotsUrl);
    }
    if (response.status === 401 || response.status === 403) {
      return decision(false, false, now, 'robots_access_denied', robotsUrl);
    }
    if (response.status < 200 || response.status >= 300) {
      return decision(false, true, now, `robots_http_${response.status}`, robotsUrl);
    }

    const rules = parseApplicableRules(response.body, this.userAgent);
    const path = `${target.pathname}${target.search}` || '/';
    const matched = rules
      .filter((rule) => matchesRule(path, rule.path))
      .sort((left, right) => {
        const lengthDifference = ruleSpecificity(right.path) - ruleSpecificity(left.path);
        return lengthDifference || Number(right.allow) - Number(left.allow);
      })[0];

    if (!matched) return decision(true, false, now, 'robots_no_matching_rule', robotsUrl);
    return decision(
      matched.allow,
      false,
      now,
      matched.allow ? 'robots_allowed' : 'robots_disallowed',
      robotsUrl,
    );
  }

  private readCache(url: string, now: Date): RobotsHttpResponse | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    if (cached.expiresAt <= now.getTime()) {
      this.cache.delete(url);
      return null;
    }
    return cached.response;
  }
}

export class AxiosRobotsFetcher implements RobotsFetcher {
  async fetch(url: string, signal?: AbortSignal): Promise<RobotsHttpResponse> {
    const response = await axios.get<string>(url, {
      signal,
      timeout: ROBOTS_TIMEOUT_MS,
      responseType: 'text',
      maxContentLength: MAX_ROBOTS_BYTES,
      maxBodyLength: MAX_ROBOTS_BYTES,
      validateStatus: () => true,
      headers: { 'User-Agent': 'EpionBot/1.0 (+https://epion.app)' },
    });
    return { status: response.status, body: String(response.data ?? '') };
  }
}

export function parseApplicableRules(content: string, userAgent: string): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let rulesStarted = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const delimiter = line.indexOf(':');
    if (delimiter < 0) continue;
    const key = line.slice(0, delimiter).trim().toLowerCase();
    const value = line.slice(delimiter + 1).trim();

    if (key === 'user-agent') {
      if (!current || rulesStarted) {
        current = { agents: [], rules: [] };
        groups.push(current);
        rulesStarted = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current || (key !== 'allow' && key !== 'disallow')) continue;
    rulesStarted = true;
    if (!value) continue;
    current.rules.push({ allow: key === 'allow', path: value });
  }

  const normalizedAgent = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some(
    (agent) => agent !== '*' && normalizedAgent.startsWith(agent),
  ));
  const selected = specific.length > 0
    ? specific
    : groups.filter((group) => group.agents.includes('*'));
  return selected.flatMap((group) => group.rules);
}

function matchesRule(path: string, rule: string): boolean {
  const anchored = rule.endsWith('$');
  const pattern = rule.replace(/\$$/, '');
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`).test(path);
}

function ruleSpecificity(rule: string): number {
  return rule.replace(/[*$]/g, '').length;
}

function decision(
  allowed: boolean,
  retryable: boolean,
  checkedAt: Date,
  reason: string,
  robotsUrl: string,
): RobotsDecision {
  return { allowed, retryable, checkedAt, reason, robotsUrl };
}
