import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, In, Repository } from 'typeorm';
import {
  MYSQL_DUP_ENTRY_ERRNO,
  MYSQL_ER_DUP_ENTRY,
} from '../common/constants/database.constants.js';
import { ArticleFavorite } from '../database/entities/article-favorite.entity.js';
import { ArticleTag } from '../database/entities/article-tag.entity.js';
import { Article } from '../database/entities/article.entity.js';
import { Follow } from '../database/entities/follow.entity.js';
import { Tag } from '../database/entities/tag.entity.js';
import { User } from '../database/entities/user.entity.js';
import {
  DEFAULT_ARTICLES_LIMIT,
  DEFAULT_ARTICLES_OFFSET,
} from './constants/articles.constants.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { FeedArticlesQueryDto } from './dto/feed-articles-query.dto.js';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import {
  buildArticleResponse,
  generateArticleSlug,
  normalizeTagList,
} from './helpers/article.helper.js';
import type {
  ArticleResponse,
  ArticlesListResponse,
} from './interfaces/article-response.interface.js';

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(ArticleTag)
    private readonly articleTagRepository: Repository<ArticleTag>,
    @InjectRepository(ArticleFavorite)
    private readonly articleFavoriteRepository: Repository<ArticleFavorite>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  async createArticle(
    currentUser: User,
    dto: CreateArticleDto,
  ): Promise<{ article: ArticleResponse }> {
    const tagNames = normalizeTagList(dto.tagList);
    const slug = generateArticleSlug(dto.title);

    const savedArticle = await this.dataSource.transaction(async (manager) => {
      const article = manager.create(Article, {
        slug,
        title: dto.title,
        description: dto.description,
        body: dto.body,
        authorId: currentUser.id,
      });

      const createdArticle = await manager.save(Article, article);

      if (tagNames.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(Tag)
          .values(tagNames.map((name) => ({ name })))
          .orIgnore()
          .execute();

        const tags = await manager.find(Tag, {
          select: { id: true, name: true },
          where: { name: In(tagNames) },
        });

        await manager
          .createQueryBuilder()
          .insert()
          .into(ArticleTag)
          .values(
            tags.map((tag) => ({
              articleId: createdArticle.id,
              tagId: tag.id,
            })),
          )
          .orIgnore()
          .execute();
      }

      return createdArticle;
    });

    savedArticle.author = currentUser;

    return {
      article: buildArticleResponse(savedArticle, {
        tagList: [...tagNames].sort(),
        favoritesCount: 0,
        favorited: false,
        authorFollowing: false,
      }),
    };
  }

  async listArticles(
    query: ListArticlesQueryDto,
    currentUserId?: number,
  ): Promise<ArticlesListResponse> {
    const limit = query.limit ?? DEFAULT_ARTICLES_LIMIT;
    const offset = query.offset ?? DEFAULT_ARTICLES_OFFSET;

    const qb = this.articleRepository
      .createQueryBuilder('article')
      .leftJoin('article.author', 'author')
      .addSelect([
        'author.id',
        'author.username',
        'author.bio',
        'author.image',
      ]);

    if (query.author) {
      qb.andWhere('author.username = :author', { author: query.author });
    }

    if (query.tag) {
      qb.andWhere(
        (subQb) => {
          const subQuery = subQb
            .subQuery()
            .select('1')
            .from(ArticleTag, 'atFilter')
            .innerJoin('atFilter.tag', 'tagFilter')
            .where('atFilter.articleId = article.id')
            .andWhere('tagFilter.name = :tag')
            .getQuery();
          return `EXISTS ${subQuery}`;
        },
        { tag: query.tag },
      );
    }

    if (query.favorited) {
      qb.andWhere(
        (subQb) => {
          const subQuery = subQb
            .subQuery()
            .select('1')
            .from(ArticleFavorite, 'afFilter')
            .innerJoin('afFilter.user', 'favUser')
            .where('afFilter.articleId = article.id')
            .andWhere('favUser.username = :favorited')
            .getQuery();
          return `EXISTS ${subQuery}`;
        },
        { favorited: query.favorited },
      );
    }

    const [articles, articlesCount] = await qb
      .orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    const hydrated = await this.hydrateArticles(articles, currentUserId);
    return { articles: hydrated, articlesCount };
  }

  async feedArticles(
    currentUserId: number,
    query: FeedArticlesQueryDto,
  ): Promise<ArticlesListResponse> {
    const follows = await this.followRepository.find({
      select: { followingId: true },
      where: { followerId: currentUserId },
    });

    const followingIds = follows.map((item) => item.followingId);
    if (followingIds.length === 0) {
      return { articles: [], articlesCount: 0 };
    }

    const limit = query.limit ?? DEFAULT_ARTICLES_LIMIT;
    const offset = query.offset ?? DEFAULT_ARTICLES_OFFSET;

    const [articles, articlesCount] = await this.articleRepository
      .createQueryBuilder('article')
      .leftJoin('article.author', 'author')
      .addSelect(['author.id', 'author.username', 'author.bio', 'author.image'])
      .where('article.authorId IN (:...followingIds)', { followingIds })
      .orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    const hydrated = await this.hydrateArticles(articles, currentUserId);
    return { articles: hydrated, articlesCount };
  }

  async getArticle(
    slug: string,
    currentUserId?: number,
  ): Promise<{ article: ArticleResponse }> {
    const article = await this.findArticleBySlugOrFail(slug);
    const [hydrated] = await this.hydrateArticles([article], currentUserId);
    return { article: hydrated };
  }

  async updateArticle(
    slug: string,
    currentUser: User,
    dto: UpdateArticleDto,
  ): Promise<{ article: ArticleResponse }> {
    const article = await this.findArticleBySlugOrFail(slug);
    this.assertArticleOwner(article, currentUser.id);

    if (dto.title !== undefined && dto.title !== article.title) {
      article.title = dto.title;
      article.slug = generateArticleSlug(dto.title);
    }
    if (dto.description !== undefined) {
      article.description = dto.description;
    }
    if (dto.body !== undefined) {
      article.body = dto.body;
    }

    const updated = await this.articleRepository.save(article);
    const [hydrated] = await this.hydrateArticles([updated], currentUser.id);
    return { article: hydrated };
  }

  async deleteArticle(slug: string, currentUser: User): Promise<void> {
    const article = await this.findArticleBySlugOrFail(slug);
    this.assertArticleOwner(article, currentUser.id);

    await this.articleRepository.delete({ id: article.id });
  }

  async favoriteArticle(
    slug: string,
    currentUserId: number,
  ): Promise<{ article: ArticleResponse }> {
    const article = await this.findArticleBySlugOrFail(slug);

    try {
      const favorite = this.articleFavoriteRepository.create({
        userId: currentUserId,
        articleId: article.id,
      });
      await this.articleFavoriteRepository.save(favorite);
    } catch (error: unknown) {
      const dbError = error as { code?: string; errno?: number };
      if (
        dbError?.code !== MYSQL_ER_DUP_ENTRY &&
        dbError?.errno !== MYSQL_DUP_ENTRY_ERRNO
      ) {
        this.logger.error(
          `Failed to favorite article (slug=${slug}, userId=${currentUserId})`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new InternalServerErrorException({
          message: this.i18n.t('articles.FAVORITE_FAILED'),
        });
      }
    }

    const [hydrated] = await this.hydrateArticles([article], currentUserId);
    return { article: hydrated };
  }

  async unfavoriteArticle(
    slug: string,
    currentUserId: number,
  ): Promise<{ article: ArticleResponse }> {
    const article = await this.findArticleBySlugOrFail(slug);

    await this.articleFavoriteRepository.delete({
      userId: currentUserId,
      articleId: article.id,
    });

    const [hydrated] = await this.hydrateArticles([article], currentUserId);
    return { article: hydrated };
  }

  private assertArticleOwner(article: Article, currentUserId: number): void {
    if (article.authorId !== currentUserId) {
      throw new ForbiddenException({
        message: this.i18n.t('articles.ARTICLE_FORBIDDEN'),
      });
    }
  }

  private async findArticleBySlugOrFail(slug: string): Promise<Article> {
    const article = await this.articleRepository
      .createQueryBuilder('article')
      .leftJoin('article.author', 'author')
      .addSelect(['author.id', 'author.username', 'author.bio', 'author.image'])
      .where('article.slug = :slug', { slug })
      .getOne();

    if (!article) {
      throw new NotFoundException({
        message: this.i18n.t('articles.ARTICLE_NOT_FOUND'),
      });
    }

    return article;
  }

  private async hydrateArticles(
    articles: Article[],
    currentUserId?: number,
  ): Promise<ArticleResponse[]> {
    if (articles.length === 0) {
      return [];
    }

    const articleIds = articles.map((article) => article.id);
    const authorIds = Array.from(
      new Set(articles.map((article) => article.authorId)),
    );
    const targetAuthorIds = authorIds.filter((id) => id !== currentUserId);

    const [tagRows, favoriteCountRows, userFavoriteRows, followRows] =
      await Promise.all([
        this.articleTagRepository
          .createQueryBuilder('at')
          .innerJoin('at.tag', 'tag')
          .select(['at.articleId AS articleId', 'tag.name AS tagName'])
          .where('at.articleId IN (:...articleIds)', { articleIds })
          .orderBy('tag.name', 'ASC')
          .getRawMany<{ articleId: number; tagName: string }>(),
        this.articleFavoriteRepository
          .createQueryBuilder('af')
          .select('af.articleId', 'articleId')
          .addSelect('COUNT(*)', 'count')
          .where('af.articleId IN (:...articleIds)', { articleIds })
          .groupBy('af.articleId')
          .getRawMany<{ articleId: number; count: string }>(),
        currentUserId
          ? this.articleFavoriteRepository.find({
              select: { articleId: true },
              where: {
                userId: currentUserId,
                articleId: In(articleIds),
              },
            })
          : Promise.resolve([]),
        currentUserId && targetAuthorIds.length > 0
          ? this.followRepository.find({
              select: { followingId: true },
              where: {
                followerId: currentUserId,
                followingId: In(targetAuthorIds),
              },
            })
          : Promise.resolve([]),
      ]);

    const tagsByArticleId = new Map<number, string[]>();
    for (const row of tagRows) {
      const id = Number(row.articleId);
      const list = tagsByArticleId.get(id) ?? [];
      list.push(row.tagName);
      tagsByArticleId.set(id, list);
    }

    const favoritesCountByArticleId = new Map<number, number>();
    for (const row of favoriteCountRows) {
      favoritesCountByArticleId.set(Number(row.articleId), Number(row.count));
    }

    const favoritedArticleIds = new Set(
      userFavoriteRows.map((row) => row.articleId),
    );
    const followedAuthorIds = new Set(followRows.map((row) => row.followingId));

    return articles.map((article) =>
      buildArticleResponse(article, {
        tagList: tagsByArticleId.get(article.id) ?? [],
        favoritesCount: favoritesCountByArticleId.get(article.id) ?? 0,
        favorited: favoritedArticleIds.has(article.id),
        authorFollowing: followedAuthorIds.has(article.authorId),
      }),
    );
  }
}
