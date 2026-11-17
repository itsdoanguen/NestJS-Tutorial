export const ATTACHABLE_TYPE = {
  USER: 'User',
  POST: 'Post',
} as const;

export type AttachableType =
  (typeof ATTACHABLE_TYPE)[keyof typeof ATTACHABLE_TYPE];

export const ATTACHMENT_URL_PREFIX = '/api/attachments';
export const AVATAR_SUBDIR = 'avatars';

export const IMAGE_MIME = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
} as const;

export const MIME_TO_EXTENSION: Record<string, string> = {
  [IMAGE_MIME.JPEG]: 'jpg',
  [IMAGE_MIME.PNG]: 'png',
  [IMAGE_MIME.WEBP]: 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(MIME_TO_EXTENSION);

export const WEBP_RIFF_SIGNATURE = 'RIFF';
export const WEBP_FORMAT_SIGNATURE = 'WEBP';
