import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { env } from '../env.js';

export type FileStorageDriver = 'local' | 's3-compatible';

export interface UploadedFileResult {
  key: string;
  publicUrl: string;
  contentType: string;
  size: number;
}

export interface UploadFileInput {
  namespace: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
  maxBytes?: number;
}

export interface FileStorage {
  readonly driver: FileStorageDriver;
  uploadFile(input: UploadFileInput): Promise<UploadedFileResult>;
  deleteFile(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  getKeyFromPublicUrl(url: string | null | undefined): string | null;
}

interface LocalStorageConfig {
  rootDir: string;
  publicBaseUrl: string;
}

interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export interface FileStorageConfig {
  driver: FileStorageDriver;
  local?: LocalStorageConfig;
  s3?: S3StorageConfig;
}

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SAFE_EXTENSION = /^[a-z0-9]{2,8}$/;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function encodeKeyForUrl(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function normalizePublicBaseUrl(value: string): string {
  return trimTrailingSlash(value);
}

function assertSafeStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('//')) {
    throw new Error('Invalid storage key.');
  }

  const segments = normalized.split('/');
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment.replace(/\.[a-z0-9]{2,8}$/i, '')))) {
    throw new Error('Invalid storage key.');
  }

  return normalized;
}

export function createSafeObjectKey(namespace: string, extension: string): string {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
  if (!SAFE_EXTENSION.test(normalizedExtension)) {
    throw new Error('Invalid file extension.');
  }

  const namespaceSegments = namespace
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  if (namespaceSegments.length === 0 || namespaceSegments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error('Invalid storage namespace.');
  }

  return [...namespaceSegments, `${crypto.randomUUID()}.${normalizedExtension}`].join('/');
}

export function assertProductionFileStorageConfig(options: {
  nodeEnv: string;
  driver: FileStorageDriver;
  allowLocalInProduction: boolean;
}): void {
  if (options.nodeEnv === 'production' && options.driver === 'local' && !options.allowLocalInProduction) {
    throw new Error('FILE_STORAGE_DRIVER=local is refused in production unless ALLOW_LOCAL_FILE_STORAGE_IN_PRODUCTION=true.');
  }
}

export function assertS3CompatibleStorageConfig(config: Partial<S3StorageConfig> | undefined): asserts config is S3StorageConfig {
  if (!config) {
    throw new Error('S3-compatible file storage config is missing.');
  }

  for (const key of [
    'endpoint',
    'region',
    'bucket',
    'accessKeyId',
    'secretAccessKey',
    'publicBaseUrl',
  ] as const) {
    if (!config[key]) {
      throw new Error(`S3-compatible file storage config is missing ${key}.`);
    }
  }

  try {
    new URL(config.endpoint!);
    new URL(config.publicBaseUrl!);
  } catch {
    throw new Error('S3-compatible file storage URLs must be valid.');
  }
}

class LocalFileStorage implements FileStorage {
  readonly driver = 'local' as const;
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(config: LocalStorageConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.publicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl);
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    if (input.maxBytes && input.buffer.length > input.maxBytes) {
      throw new Error('File exceeds configured storage limit.');
    }

    const key = createSafeObjectKey(input.namespace, input.extension);
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer, { flag: 'wx' });

    return {
      key,
      publicUrl: this.getPublicUrl(key),
      contentType: input.contentType,
      size: input.buffer.length,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${encodeKeyForUrl(assertSafeStorageKey(key))}`;
  }

  getKeyFromPublicUrl(url: string | null | undefined): string | null {
    if (!url) return null;

    if (url.startsWith('/uploads/')) {
      return this.safeKeyOrNull(url.slice('/uploads/'.length));
    }

    const prefix = `${this.publicBaseUrl}/`;
    if (url.startsWith(prefix)) {
      return this.safeKeyOrNull(decodeURIComponent(url.slice(prefix.length)));
    }

    return null;
  }

  private resolveKey(key: string): string {
    const safeKey = assertSafeStorageKey(key);
    const filePath = path.resolve(this.rootDir, ...safeKey.split('/'));
    const rootWithSeparator = this.rootDir.endsWith(path.sep) ? this.rootDir : `${this.rootDir}${path.sep}`;

    if (!filePath.startsWith(rootWithSeparator)) {
      throw new Error('Invalid storage path.');
    }

    return filePath;
  }

  private safeKeyOrNull(key: string): string | null {
    try {
      return assertSafeStorageKey(key);
    } catch {
      return null;
    }
  }
}

class S3CompatibleStorage implements FileStorage {
  readonly driver = 's3-compatible' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.publicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl);
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    if (input.maxBytes && input.buffer.length > input.maxBytes) {
      throw new Error('File exceeds configured storage limit.');
    }

    const key = createSafeObjectKey(input.namespace, input.extension);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return {
      key,
      publicUrl: this.getPublicUrl(key),
      contentType: input.contentType,
      size: input.buffer.length,
    };
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: assertSafeStorageKey(key),
    }));
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${encodeKeyForUrl(assertSafeStorageKey(key))}`;
  }

  getKeyFromPublicUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const prefix = `${this.publicBaseUrl}/`;
    if (!url.startsWith(prefix)) return null;

    try {
      return assertSafeStorageKey(decodeURIComponent(url.slice(prefix.length)));
    } catch {
      return null;
    }
  }
}

export function createFileStorage(config: FileStorageConfig): FileStorage {
  if (config.driver === 'local') {
    if (!config.local) throw new Error('Local file storage config is missing.');
    return new LocalFileStorage(config.local);
  }

  assertS3CompatibleStorageConfig(config.s3);
  return new S3CompatibleStorage(config.s3);
}

export function getLocalUploadRoot(): string {
  return path.resolve(process.cwd(), 'public', 'uploads');
}

export function getUploadMaxBytes(): number {
  return Math.floor(env.UPLOAD_MAX_SIZE_MB * 1024 * 1024);
}

export function isLocalFileStorage(): boolean {
  return env.FILE_STORAGE_DRIVER === 'local';
}

function getLocalPublicBaseUrl(): string {
  const baseUrl = env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`;
  return `${trimTrailingSlash(baseUrl)}/uploads`;
}

export function createConfiguredFileStorage(): FileStorage {
  assertProductionFileStorageConfig({
    nodeEnv: env.NODE_ENV,
    driver: env.FILE_STORAGE_DRIVER,
    allowLocalInProduction: env.ALLOW_LOCAL_FILE_STORAGE_IN_PRODUCTION,
  });

  return createFileStorage({
    driver: env.FILE_STORAGE_DRIVER,
    local: {
      rootDir: getLocalUploadRoot(),
      publicBaseUrl: getLocalPublicBaseUrl(),
    },
    s3: env.FILE_STORAGE_DRIVER === 's3-compatible'
      ? {
        endpoint: env.S3_ENDPOINT!,
        region: env.S3_REGION!,
        bucket: env.S3_BUCKET!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
      }
      : undefined,
  });
}

export const fileStorage = createConfiguredFileStorage();
