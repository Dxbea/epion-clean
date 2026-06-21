import { logger } from './logger.js';
import { fileStorage, getUploadMaxBytes } from './file-storage.js';
import { FileValidationError, parseImageDataUrl } from './file-validation.js';

const AVATAR_MAX_BYTES = Math.min(getUploadMaxBytes(), 2 * 1024 * 1024);
const BANNER_MAX_BYTES = getUploadMaxBytes();

export type ProfileImageKind = 'avatars' | 'banners';

export function getProfileImageMaxBytes(kind: ProfileImageKind): number {
  return kind === 'avatars' ? AVATAR_MAX_BYTES : BANNER_MAX_BYTES;
}

export async function uploadProfileImage(options: {
  userId: string;
  kind: ProfileImageKind;
  dataUrl: string;
}): Promise<string> {
  const validated = parseImageDataUrl({
    dataUrl: options.dataUrl,
    maxBytes: getProfileImageMaxBytes(options.kind),
    tooLargeCode: options.kind === 'avatars' ? 'AVATAR_TOO_LARGE' : 'BANNER_TOO_LARGE',
  });

  const uploaded = await fileStorage.uploadFile({
    namespace: `profile-images/${options.kind}/${options.userId}`,
    buffer: validated.buffer,
    contentType: validated.contentType,
    extension: validated.extension,
    maxBytes: getProfileImageMaxBytes(options.kind),
  });

  return uploaded.publicUrl;
}

export async function deleteStoredProfileImageByUrl(url: string | null | undefined): Promise<void> {
  const key = fileStorage.getKeyFromPublicUrl(url);
  if (!key) return;

  try {
    await fileStorage.deleteFile(key);
  } catch (error) {
    logger.warn('Failed to delete stored profile image', {
      module: 'FileStorage',
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export function toUploadError(error: unknown): { status: number; body: { error: string } } | null {
  if (error instanceof FileValidationError) {
    return { status: error.status, body: { error: error.code } };
  }

  return null;
}
