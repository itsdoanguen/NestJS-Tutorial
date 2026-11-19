import type { ProfileResponse } from '../../profiles/interfaces/profile-response.interface.js';

export interface ArticleResponse {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  createdAt: Date;
  updatedAt: Date;
  favorited: boolean;
  favoritesCount: number;
  author: ProfileResponse;
}

export interface ArticlesListResponse {
  articles: ArticleResponse[];
  articlesCount: number;
}

export interface ArticleHydrationMeta {
  tagList: string[];
  favoritesCount: number;
  favorited: boolean;
  authorFollowing: boolean;
}
