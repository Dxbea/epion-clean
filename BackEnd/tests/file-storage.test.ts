import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  assertProductionFileStorageConfig,
  assertS3CompatibleStorageConfig,
  createFileStorage,
  createSafeObjectKey,
} from '../src/lib/file-storage.js';
import { parseImageDataUrl, validateFileBuffer } from '../src/lib/file-validation.js';

const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'epion-storage-'));
}

describe('file storage', () => {
  it('stores, serves, resolves, and deletes files locally for development/test', async () => {
    const rootDir = makeTempRoot();
    const storage = createFileStorage({
      driver: 'local',
      local: {
        rootDir,
        publicBaseUrl: 'http://api.test/uploads',
      },
    });

    const uploaded = await storage.uploadFile({
      namespace: 'profile-images/avatars/user_123',
      buffer: PNG_BUFFER,
      contentType: 'image/png',
      extension: 'png',
      maxBytes: 1024,
    });

    const fullPath = path.join(rootDir, ...uploaded.key.split('/'));
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(uploaded.publicUrl).toMatch(/^http:\/\/api\.test\/uploads\/profile-images\/avatars\/user_123\/[a-f0-9-]+\.png$/);
    expect(uploaded.publicUrl).not.toContain(rootDir);
    expect(storage.getKeyFromPublicUrl(uploaded.publicUrl)).toBe(uploaded.key);

    await storage.deleteFile(uploaded.key);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('refuses local storage in production unless explicitly opted in', () => {
    expect(() => assertProductionFileStorageConfig({
      nodeEnv: 'production',
      driver: 'local',
      allowLocalInProduction: false,
    })).toThrow(/FILE_STORAGE_DRIVER=local/);

    expect(() => assertProductionFileStorageConfig({
      nodeEnv: 'production',
      driver: 'local',
      allowLocalInProduction: true,
    })).not.toThrow();
  });

  it('generates safe non-predictable object keys without trusting original names', () => {
    const key = createSafeObjectKey('profile-images/banners/user-123', 'jpg');

    expect(key).toMatch(/^profile-images\/banners\/user-123\/[a-f0-9-]+\.jpg$/);
    expect(key).not.toContain('..');
    expect(key).not.toContain('user-123.jpg');
    expect(() => createSafeObjectKey('../banners', 'jpg')).toThrow(/namespace/i);
    expect(() => createSafeObjectKey('profile-images/banners', '../jpg')).toThrow(/extension/i);
  });

  it('prevents path traversal through public URL resolution and deletes', async () => {
    const storage = createFileStorage({
      driver: 'local',
      local: {
        rootDir: makeTempRoot(),
        publicBaseUrl: 'http://api.test/uploads',
      },
    });

    expect(storage.getKeyFromPublicUrl('/uploads/../secret.txt')).toBeNull();
    expect(() => storage.getPublicUrl('../secret.txt')).toThrow(/storage key/i);
    await expect(storage.deleteFile('../secret.txt')).rejects.toThrow(/storage key/i);
  });


  it('rejects missing or invalid critical S3-compatible settings', () => {
    const validConfig = {
      endpoint: 'https://object.example.com',
      region: 'eu-west-3',
      bucket: 'epion-uploads',
      accessKeyId: 'placeholder-key',
      secretAccessKey: 'placeholder-secret',
      publicBaseUrl: 'https://cdn.example.com/epion-uploads',
    };

    for (const key of ['endpoint', 'region', 'bucket', 'accessKeyId', 'secretAccessKey', 'publicBaseUrl'] as const) {
      const config = { ...validConfig };
      delete config[key];
      expect(() => assertS3CompatibleStorageConfig(config)).toThrow(key);
    }

    expect(() => assertS3CompatibleStorageConfig({
      ...validConfig,
      endpoint: 'not-a-url',
    })).toThrow(/URLs must be valid/);

    expect(() => assertS3CompatibleStorageConfig({
      ...validConfig,
      publicBaseUrl: 'not-a-url',
    })).toThrow(/URLs must be valid/);
  });

  it('uses configured public S3-compatible URLs instead of local disk paths', () => {
    const storage = createFileStorage({
      driver: 's3-compatible',
      s3: {
        endpoint: 'https://object.example.com',
        region: 'eu-west-3',
        bucket: 'epion-uploads',
        accessKeyId: 'placeholder-key',
        secretAccessKey: 'placeholder-secret',
        publicBaseUrl: 'https://cdn.example.com/epion-uploads',
      },
    });

    const url = storage.getPublicUrl('profile-images/avatars/user-123/image.png');

    expect(url).toBe('https://cdn.example.com/epion-uploads/profile-images/avatars/user-123/image.png');
    expect(url).not.toContain('public/uploads');
    expect(url).not.toMatch(/^[A-Za-z]:/);
    expect(storage.getKeyFromPublicUrl(url)).toBe('profile-images/avatars/user-123/image.png');
  });
});

describe('file validation', () => {
  it('accepts image data URLs only when MIME and magic bytes match', () => {
    const validDataUrl = `data:image/png;base64,${PNG_BUFFER.toString('base64')}`;

    expect(parseImageDataUrl({ dataUrl: validDataUrl, maxBytes: 1024, tooLargeCode: 'TOO_LARGE' })).toMatchObject({
      contentType: 'image/png',
      extension: 'png',
      size: PNG_BUFFER.length,
    });

    const mismatchedDataUrl = `data:image/png;base64,${JPEG_BUFFER.toString('base64')}`;
    expect(() => parseImageDataUrl({ dataUrl: mismatchedDataUrl, maxBytes: 1024, tooLargeCode: 'TOO_LARGE' })).toThrow(/declared type/);
  });

  it('rejects unsupported MIME types and oversized files', () => {
    expect(() => validateFileBuffer({
      buffer: Buffer.from('hello'),
      declaredMimeType: 'text/plain',
      allowedMimeTypes: ['image/png'],
      maxBytes: 1024,
    })).toThrow(/Unsupported file type/);

    expect(() => validateFileBuffer({
      buffer: PNG_BUFFER,
      declaredMimeType: 'image/png',
      allowedMimeTypes: ['image/png'],
      maxBytes: 4,
      tooLargeCode: 'IMAGE_TOO_LARGE',
    })).toThrow(/too large/);
  });
});
