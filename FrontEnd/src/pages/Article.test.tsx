import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Article from './Article';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.hoisted(() => vi.fn());
const meMock = vi.hoisted(() => ({
  value: { id: 'author-1', email: 'author@example.com' },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({ me: meMock.value }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/SectionHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/components/articles/ArticleThumbnail', () => ({
  default: () => <div data-testid="thumbnail" />,
}));

vi.mock('@/components/articles/ArticleInteractionSpace', () => ({
  default: () => <div data-testid="interactions" />,
}));

vi.mock('@/components/articles/ArticleCard', () => ({
  default: () => <article data-testid="related" />,
}));

vi.mock('@/components/articles/ArticleActionBar', () => ({
  default: ({ onSummarize, onFactCheck }: { onSummarize: () => void; onFactCheck: () => void }) => (
    <div>
      <button type="button" onClick={onSummarize}>Summarize</button>
      <button type="button" onClick={onFactCheck}>Fact-check</button>
    </div>
  ),
}));

vi.mock('@/components/shared/TrustHeader', () => ({
  default: () => <div data-testid="trust" />,
}));

vi.mock('@/components/chat/trust-score-ui/GlobalTrustScoreModal', () => ({
  GlobalTrustScoreModal: () => <div data-testid="trust-modal" />,
}));

vi.mock('@/components/ui/Modal', () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock('../components/chat/SourceCard', () => ({
  default: () => <div data-testid="source-card" />,
}));

vi.mock('@/components/shared/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/components/articles/StructuredArticleRenderer', () => ({
  default: () => <div data-testid="structured" />,
}));

const articlePayload = {
  id: 'article-1',
  slug: 'test-article',
  title: 'Test article',
  excerpt: 'Short excerpt',
  content: 'Article body',
  structuredContent: null,
  imageUrl: null,
  publishedAt: '2026-06-20T10:00:00.000Z',
  category: { id: 'cat-1', slug: 'news', name: 'News' },
  author: { id: 'author-1', email: 'author@example.com', name: 'Author', username: 'author', avatarUrl: null },
  aiSummary: null,
  factCheckScore: null,
  factCheckData: null,
  sources: [],
  generationPrompt: null,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function emptyResponse(status = 204) {
  return Promise.resolve(new Response(null, { status }));
}

function installFetchMock() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('/api/articles/slug/test-article')) return jsonResponse(articlePayload);
    if (url.includes('/api/articles/article-1/view')) return emptyResponse();
    if (url.includes('/api/articles/article-1/stats')) return jsonResponse({ viewsAll: 12 });
    if (url.includes('/api/articles?')) return jsonResponse({ items: [] });
    if (url.includes('/api/csrf')) return jsonResponse({ token: 'csrf-token-1' });
    if (url.includes('/api/ai/summarize')) return jsonResponse({ summary: 'Generated summary' });
    if (url.includes('/api/ai/fact-check')) return jsonResponse({ cached: true, analysis: { factScore: 81, sources: [] } });
    if (url.includes('/api/articles/article-1') && init?.method === 'DELETE') return emptyResponse();

    return jsonResponse({ error: 'Unhandled test request', url }, 500);
  }));
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderArticle() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/article/test-article"]}>
        <Routes>
          <Route path="/article/:slug" element={<Article />} />
        </Routes>
      </MemoryRouter>,
    );
  });

  await flush();
  await flush();

  return container;
}

function fetchCalls() {
  return vi.mocked(fetch).mock.calls;
}

function findCall(path: string, method?: string) {
  return fetchCalls().find(([input, init]) => {
    const matchesPath = String(input).includes(path);
    const matchesMethod = method ? init?.method === method : true;
    return matchesPath && matchesMethod;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockClear();
  sessionStorage.clear();
  installFetchMock();
  vi.stubGlobal('confirm', vi.fn(() => true));
  window.scrollTo = vi.fn();
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('Article CSRF handling', () => {
  it('records the public article view without fetching or sending a CSRF token', async () => {
    await renderArticle();

    const viewCall = findCall('/api/articles/article-1/view', 'POST');
    expect(viewCall).toBeTruthy();
    expect(viewCall?.[1]).toEqual({ method: 'POST', credentials: 'include' });
    expect(findCall('/api/csrf')).toBeUndefined();
  });

  it('sends CSRF headers for authenticated Article mutations', async () => {
    const view = await renderArticle();

    await act(async () => {
      [...view.querySelectorAll('button')].find((button) => button.textContent === 'Summarize')?.click();
    });
    await flush();

    await act(async () => {
      [...view.querySelectorAll('button')].find((button) => button.textContent === 'Fact-check')?.click();
    });
    await flush();

    await act(async () => {
      [...view.querySelectorAll('button')].find((button) => button.textContent === 'Edit')?.click();
    });
    await flush();

    await act(async () => {
      [...view.querySelectorAll('button')].find((button) => button.textContent === 'Delete')?.click();
    });
    await flush();

    expect(findCall('/api/csrf')).toBeTruthy();

    for (const [path, method] of [
      ['/api/ai/summarize', 'POST'],
      ['/api/ai/fact-check', 'POST'],
      ['/api/articles/article-1', 'DELETE'],
    ] as const) {
      const call = findCall(path, method);
      expect(call).toBeTruthy();
      expect((call?.[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-token-1');
      expect(call?.[1]?.credentials).toBe('include');
    }
  });
});
