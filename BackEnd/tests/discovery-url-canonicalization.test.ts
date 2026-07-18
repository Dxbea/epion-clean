import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_URL_CANONICALIZATION_VERSION,
  buildCanonicalizedDocumentUrl,
  canonicalizeDiscoveredUrl,
  hashDiscoveredUrl,
} from '../src/lib/discovery/url-canonicalization.js';

describe('discovery URL canonicalization', () => {
  it('normalizes host, path, query order, fragments, and tracking parameters', () => {
    const first = 'HTTPS://WWW.Example.COM:443/news//story/?b=2&utm_source=feed&a=1#section';
    const second = 'https://www.example.com/news/story?a=1&b=2';

    expect(canonicalizeDiscoveredUrl(first)).toBe(second);
    expect(hashDiscoveredUrl(first)).toBe(hashDiscoveredUrl(second));
  });

  it('removes case-insensitive campaign parameters without dropping content parameters', () => {
    const first = 'https://example.com/watch?v=abc&UTM_Campaign=launch&fbclid=tracking';
    const second = 'https://example.com/watch?v=abc';

    expect(canonicalizeDiscoveredUrl(first)).toBe(second);
    expect(hashDiscoveredUrl(first)).toBe(hashDiscoveredUrl(second));
    expect(hashDiscoveredUrl(second)).not.toBe(hashDiscoveredUrl('https://example.com/watch?v=def'));
  });

  it('preserves duplicate content parameters in stable order', () => {
    expect(canonicalizeDiscoveredUrl('https://example.com/search?tag=z&tag=a&q=news'))
      .toBe('https://example.com/search?q=news&tag=a&tag=z');
  });

  it('returns a complete persistence identity while keeping the original URL', () => {
    const identity = buildCanonicalizedDocumentUrl(
      ' https://WWW.Example.com/report/?utm_medium=rss&id=42#top ',
    );

    expect(identity).toEqual({
      originalUrl: 'https://WWW.Example.com/report/?utm_medium=rss&id=42#top',
      canonicalUrl: 'https://www.example.com/report?id=42',
      canonicalUrlHash: hashDiscoveredUrl('https://www.example.com/report?id=42'),
      canonicalizationVersion: DISCOVERY_URL_CANONICALIZATION_VERSION,
      domain: 'example.com',
    });
  });

  it('rejects unsupported, credential-bearing, malformed, and oversized URLs', () => {
    expect(canonicalizeDiscoveredUrl('ftp://example.com/file')).toBeNull();
    expect(canonicalizeDiscoveredUrl('https://user:secret@example.com/story')).toBeNull();
    expect(canonicalizeDiscoveredUrl('not a URL')).toBeNull();
    expect(canonicalizeDiscoveredUrl(`https://example.com/${'a'.repeat(5000)}`)).toBeNull();
  });

  it('does not merge distinct www and apex hosts without a trusted canonical hint', () => {
    expect(hashDiscoveredUrl('https://www.example.com/story'))
      .not.toBe(hashDiscoveredUrl('https://example.com/story'));
  });
});
