import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadUserDataExport } from './userDataExport';

describe('downloadUserDataExport', () => {
  let clickMock: ReturnType<typeof vi.fn>;
  let createdAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    clickMock = vi.fn();
    createdAnchor = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="epion-export-test.json"',
        }),
        blob: async () => new Blob(['{"ok":true}'], { type: 'application/json' }),
      })),
    );

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:epion-export'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      if (tagName.toLowerCase() === 'a') {
        createdAnchor = element as HTMLAnchorElement;
        createdAnchor.click = clickMock;
      }
      return element as HTMLElement;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the authenticated export and triggers a JSON download', async () => {
    await downloadUserDataExport();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/me/export'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
    expect(createdAnchor?.download).toBe('epion-export-test.json');
    expect(createdAnchor?.href).toBe('blob:epion-export');
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:epion-export');
  });

  it('throws when the export endpoint rejects the user', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(downloadUserDataExport()).rejects.toMatchObject({ status: 401 });
  });
});
