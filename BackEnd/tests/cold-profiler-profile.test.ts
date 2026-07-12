import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchSerper: vi.fn(),
  callWebSearchLLM: vi.fn(),
}));

vi.mock('../src/lib/serper.js', () => ({ searchSerper: mocks.searchSerper }));
vi.mock('../src/lib/web-chat.js', () => ({ callWebSearchLLM: mocks.callWebSearchLLM }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { evaluateUnknownSource } = await import('../src/lib/cold-profiler.js');

describe('cold-profiler global source profiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a global YouTube profile and preserves the real search references', async () => {
    mocks.searchSerper.mockResolvedValue([
      { title: 'About YouTube', url: 'https://about.youtube/', content: 'YouTube is a Google video platform.' },
      { title: 'YouTube business model', url: 'https://example.org/youtube-business', content: 'Advertising and subscriptions.' },
    ]);
    mocks.callWebSearchLLM.mockResolvedValue({
      answer: JSON.stringify({
        reliability: 'MIXED',
        sourceType: 'SOCIAL',
        politicalBias: 'UNKNOWN',
        biasScore: 0,
        short_bio: 'Plateforme mondiale de partage de vidéos.',
        profileSummary: 'YouTube est une plateforme mondiale de partage de vidéos exploitée par Google.',
        ownership: 'Google',
        businessModel: 'Publicité et abonnements.',
        editorialPositioning: null,
        specialty: 'Hébergement et diffusion de vidéos.',
        strengths: ['Infrastructure de diffusion vidéo à grande échelle.'],
        vigilancePoints: ['La fiabilité dépend du compte, de l’auteur et du contenu cité.'],
        claimReferences: {
          'editorialReputation.reliabilitySignals': ['ref_1'],
          vigilancePoints: ['ref_1'],
        },
        reasoning: 'Profil fondé sur les références fournies.',
      }),
    });

    const result = await evaluateUnknownSource('youtube.com');

    expect(result.profileSummary).toContain('plateforme mondiale');
    expect(result.vigilancePoints).toEqual(['La fiabilité dépend du compte, de l’auteur et du contenu cité.']);
    expect(result.externalReferences).toEqual([
      { id: 'ref_1', label: 'About YouTube', url: 'https://about.youtube/', publisher: 'about.youtube', referenceType: 'Résultat de recherche externe' },
      { id: 'ref_2', label: 'YouTube business model', url: 'https://example.org/youtube-business', publisher: 'example.org', referenceType: 'Résultat de recherche externe' },
    ]);
    expect(result.claimReferences).toEqual({
      'editorialReputation.reliabilitySignals': ['ref_1'],
      vigilancePoints: ['ref_1'],
    });
    const prompt = mocks.callWebSearchLLM.mock.calls[0][0][0].content;
    expect(prompt).toContain("jamais l'article, la vidéo, le post");
    expect(prompt).toContain('décris uniquement la plateforme globale');
  });

  it('returns no strong profile assertion when no external reference exists', async () => {
    mocks.searchSerper.mockResolvedValue([]);

    const result = await evaluateUnknownSource('unknown.example');

    expect(result.profileSummary).toBeNull();
    expect(result.ownership).toBeNull();
    expect(result.strengths).toEqual([]);
    expect(result.vigilancePoints).toEqual([]);
    expect(result.externalReferences).toEqual([]);
    expect(mocks.callWebSearchLLM).not.toHaveBeenCalled();
  });

  it('drops sensitive claims when the model does not link them to a valid reference', async () => {
    mocks.searchSerper.mockResolvedValue([
      { title: 'General notice', url: 'https://example.org/notice', content: 'General source description.' },
    ]);
    mocks.callWebSearchLLM.mockResolvedValue({
      answer: JSON.stringify({
        reliability: 'MIXED',
        sourceType: 'MEDIA',
        politicalBias: 'UNKNOWN',
        biasScore: 0,
        profileSummary: 'Description neutre de la source.',
        editorialPositioning: 'Positionnement partisan affirmé.',
        misinformationSignals: ['Accusation de désinformation.'],
        editorialPolicy: 'Politique de correction publiée.',
        strengths: ['Signal de fiabilité fort.'],
        vigilancePoints: ['Controverse alléguée.'],
        claimReferences: {
          'editorialReputation.editorialPolicy': ['ref_1'],
          'editorialReputation.misinformationSignals': ['ref_999'],
        },
      }),
    });

    const result = await evaluateUnknownSource('example.org');

    expect(result.editorialPositioning).toBeNull();
    expect(result.misinformationSignals).toEqual([]);
    expect(result.strengths).toEqual([]);
    expect(result.vigilancePoints).toEqual([]);
    expect(result.editorialPolicy).toBe('Politique de correction publiée.');
    expect(result.claimReferences).toEqual({
      'editorialReputation.editorialPolicy': ['ref_1'],
    });
  });
});
