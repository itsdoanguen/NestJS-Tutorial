import { describe, expect, it } from 'vitest';
import { generateArticleSlug, normalizeTagList } from './article.helper.js';

describe('article.helper', () => {
  describe('generateArticleSlug', () => {
    it('should transliterate Vietnamese characters and append a hex suffix', () => {
      const slug = generateArticleSlug('Hướng dẫn NestJS căn bản!');
      expect(slug).toMatch(/^huong-dan-nestjs-can-ban-[0-9a-f]{8}$/);
    });

    it('should produce distinct slugs for identical titles', () => {
      const slug1 = generateArticleSlug('How to train your dragon');
      const slug2 = generateArticleSlug('How to train your dragon');
      expect(slug1).not.toBe(slug2);
      expect(slug1).toMatch(/^how-to-train-your-dragon-[0-9a-f]{8}$/);
    });

    it('should fall back to default base when title has only special characters', () => {
      const slug = generateArticleSlug('!!! ???');
      expect(slug).toMatch(/^article-[0-9a-f]{8}$/);
    });
  });

  describe('normalizeTagList', () => {
    it('should trim, drop empty strings, and deduplicate tags', () => {
      expect(
        normalizeTagList(['  nestjs ', 'mysql', 'nestjs', '', '   ', 'redis']),
      ).toEqual(['nestjs', 'mysql', 'redis']);
    });

    it('should return empty array when tagList is undefined or empty', () => {
      expect(normalizeTagList(undefined)).toEqual([]);
      expect(normalizeTagList([])).toEqual([]);
    });
  });
});
