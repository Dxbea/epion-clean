declare module '@mozilla/readability' {
  export interface ReadabilityParseResult {
    title?: string;
    byline?: string;
    content?: string;
    textContent?: string;
    excerpt?: string;
    siteName?: string;
  }

  export class Readability {
    constructor(document: Document, options?: Record<string, unknown>);
    parse(): ReadabilityParseResult | null;
  }
}

declare module 'node-curl-impersonate' {
  const curlImpersonate: Record<string, unknown>;
  export default curlImpersonate;
  export const request: (...args: unknown[]) => Promise<unknown>;
  export const fetch: (...args: unknown[]) => Promise<unknown>;
}
