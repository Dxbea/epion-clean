export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageMimeType = typeof IMAGE_MIME_TYPES[number];

export const ATTACHMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;
export type AttachmentMimeType = typeof ATTACHMENT_MIME_TYPES[number];

const IMAGE_EXTENSIONS: Record<ImageMimeType, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class FileValidationError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'FileValidationError';
    this.status = status;
    this.code = code;
  }
}

export interface ValidatedFile {
  buffer: Buffer;
  contentType: AttachmentMimeType;
  extension: string;
  size: number;
}

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function detectContentType(buffer: Buffer): AttachmentMimeType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  return null;
}

function extensionForContentType(contentType: AttachmentMimeType): string {
  if (contentType === 'application/pdf') return 'pdf';
  return IMAGE_EXTENSIONS[contentType];
}

export function validateFileBuffer(options: {
  buffer: Buffer;
  declaredMimeType: string;
  allowedMimeTypes: readonly AttachmentMimeType[];
  maxBytes: number;
  tooLargeCode?: string;
  unsupportedCode?: string;
  mismatchCode?: string;
}): ValidatedFile {
  const declaredMimeType = normalizeMimeType(options.declaredMimeType);
  const allowedMimeTypes = new Set<string>(options.allowedMimeTypes);

  if (!allowedMimeTypes.has(declaredMimeType)) {
    throw new FileValidationError(
      options.unsupportedCode ?? 'UNSUPPORTED_FILE_TYPE',
      'Unsupported file type.',
    );
  }

  if (options.buffer.length === 0) {
    throw new FileValidationError('EMPTY_FILE', 'The file is empty.');
  }

  if (options.buffer.length > options.maxBytes) {
    throw new FileValidationError(
      options.tooLargeCode ?? 'FILE_TOO_LARGE',
      'The file is too large.',
      413,
    );
  }

  const detected = detectContentType(options.buffer);
  if (!detected || detected !== declaredMimeType || !allowedMimeTypes.has(detected)) {
    throw new FileValidationError(
      options.mismatchCode ?? 'FILE_TYPE_MISMATCH',
      'The file content does not match its declared type.',
    );
  }

  return {
    buffer: options.buffer,
    contentType: detected,
    extension: extensionForContentType(detected),
    size: options.buffer.length,
  };
}

export function parseImageDataUrl(options: {
  dataUrl: string;
  maxBytes: number;
  tooLargeCode: string;
}): ValidatedFile {
  const match = options.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) {
    throw new FileValidationError('BAD_INPUT', 'Invalid image data URL.');
  }

  const base64Data = match[2];
  if (base64Data.length % 4 !== 0) {
    throw new FileValidationError('BAD_INPUT', 'Invalid base64 payload.');
  }

  return validateFileBuffer({
    buffer: Buffer.from(base64Data, 'base64'),
    declaredMimeType: match[1],
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxBytes: options.maxBytes,
    tooLargeCode: options.tooLargeCode,
    unsupportedCode: 'BAD_INPUT',
    mismatchCode: 'INVALID_IMAGE_FORMAT',
  });
}
