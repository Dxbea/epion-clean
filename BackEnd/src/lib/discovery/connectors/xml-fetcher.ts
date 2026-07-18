import axiosInstance from '../../http-client.js';
import type { DiscoveryContext } from '../types.js';

const DEFAULT_MAX_XML_BYTES = 5 * 1024 * 1024;

export interface XmlFetchRequest {
  timeoutMs: number;
  signal?: AbortSignal;
  etag?: string | null;
  lastModified?: string | null;
  maxBytes?: number;
}

export interface XmlFetchResponse {
  body: string;
  notModified: boolean;
  etag?: string;
  lastModified?: string;
}

export interface XmlFetcher {
  fetch(url: string, request: XmlFetchRequest): Promise<XmlFetchResponse>;
}

export class AxiosXmlFetcher implements XmlFetcher {
  async fetch(url: string, request: XmlFetchRequest): Promise<XmlFetchResponse> {
    const maxBytes = request.maxBytes ?? DEFAULT_MAX_XML_BYTES;
    const response = await axiosInstance.get<string>(url, {
      responseType: 'text',
      timeout: request.timeoutMs,
      signal: request.signal,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      validateStatus: (status) => status === 200 || status === 304,
      headers: {
        Accept: 'application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9',
        'User-Agent': 'EpionBot/1.0 (+https://epion.app)',
        ...(request.etag ? { 'If-None-Match': request.etag } : {}),
        ...(request.lastModified ? { 'If-Modified-Since': request.lastModified } : {}),
      },
    });

    return {
      body: response.status === 304 ? '' : response.data,
      notModified: response.status === 304,
      etag: headerValue(response.headers.etag),
      lastModified: headerValue(response.headers['last-modified']),
    };
  }
}

export const axiosXmlFetcher = new AxiosXmlFetcher();

export function rootFetchRequest(context: DiscoveryContext, maxBytes: number): XmlFetchRequest {
  return {
    timeoutMs: context.source.requestTimeoutMs,
    signal: context.signal,
    etag: context.source.etag,
    lastModified: context.source.lastModified,
    maxBytes,
  };
}

function headerValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}
