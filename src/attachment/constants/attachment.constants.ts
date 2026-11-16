export const ATTACHABLE_TYPE = {
  USER: 'User',
  POST: 'Post',
} as const;

export type AttachableType =
  (typeof ATTACHABLE_TYPE)[keyof typeof ATTACHABLE_TYPE];

export const ATTACHMENT_URL_PREFIX = '/api/attachments';
export const AVATAR_SUBDIR = 'avatars';

export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(MIME_TO_EXTENSION);
