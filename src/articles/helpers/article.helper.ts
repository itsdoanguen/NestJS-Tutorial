import * as crypto from 'crypto';
import type { Article } from '../../database/entities/article.entity.js';
import {
  SLUG_BASE_MAX_LENGTH,
  SLUG_RANDOM_BYTES,
} from '../constants/articles.constants.js';
import type {
  ArticleHydrationMeta,
  ArticleResponse,
} from '../interfaces/article-response.interface.js';

const DEFAULT_SLUG_BASE = 'article';

export function generateArticleSlug(title: string): string {
  const normalized = title
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');

  const base = normalized || DEFAULT_SLUG_BASE;
  const suffix = crypto.randomBytes(SLUG_RANDOM_BYTES).toString('hex');
  return `${base}-${suffix}`;
}

export function normalizeTagList(tagList?: string[]): string[] {
  if (!tagList || tagList.length === 0) {
    return [];
  }
  const trimmed = tagList
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return Array.from(new Set(trimmed));
}

export function buildArticleResponse(
  article: Article,
  meta: ArticleHydrationMeta,
): ArticleResponse {
  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    tagList: meta.tagList,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    favorited: meta.favorited,
    favoritesCount: meta.favoritesCount,
    author: {
      username: article.author.username,
      bio: article.author.bio,
      image: article.author.image,
      following: meta.authorFollowing,
    },
  };
}
