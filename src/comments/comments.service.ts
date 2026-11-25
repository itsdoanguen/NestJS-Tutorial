import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import { Article } from '../database/entities/article.entity.js';
import { Comment } from '../database/entities/comment.entity.js';
import { Follow } from '../database/entities/follow.entity.js';
import { User } from '../database/entities/user.entity.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { buildCommentResponse } from './helpers/comment.helper.js';
import type { CommentResponse } from './interfaces/comment-response.interface.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    private readonly i18n: I18nService,
  ) {}

  async addComment(
    slug: string,
    currentUser: User,
    dto: CreateCommentDto,
  ): Promise<{ comment: CommentResponse }> {
    const article = await this.findArticleBySlugOrFail(slug);

    const comment = this.commentRepository.create({
      body: dto.body,
      articleId: article.id,
      authorId: currentUser.id,
    });

    const savedComment = await this.commentRepository.save(comment);
    savedComment.author = currentUser;

    return {
      comment: buildCommentResponse(savedComment, false),
    };
  }

  async getComments(
    slug: string,
    currentUserId?: number,
  ): Promise<{ comments: CommentResponse[] }> {
    const article = await this.findArticleBySlugOrFail(slug);

    const comments = await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .addSelect(['author.id', 'author.username', 'author.bio', 'author.image'])
      .where('comment.articleId = :articleId', { articleId: article.id })
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .getMany();

    if (comments.length === 0) {
      return { comments: [] };
    }

    const targetAuthorIds = Array.from(
      new Set(comments.map((comment) => comment.authorId)),
    ).filter((authorId) => authorId !== currentUserId);

    const followRows =
      currentUserId && targetAuthorIds.length > 0
        ? await this.followRepository.find({
            select: { followingId: true },
            where: {
              followerId: currentUserId,
              followingId: In(targetAuthorIds),
            },
          })
        : [];

    const followedAuthorIds = new Set(followRows.map((row) => row.followingId));

    return {
      comments: comments.map((comment) =>
        buildCommentResponse(comment, followedAuthorIds.has(comment.authorId)),
      ),
    };
  }

  async deleteComment(
    slug: string,
    commentId: number,
    currentUserId: number,
  ): Promise<void> {
    const article = await this.findArticleBySlugOrFail(slug);

    const comment = await this.commentRepository.findOne({
      select: { id: true, authorId: true },
      where: { id: commentId, articleId: article.id },
    });

    if (!comment) {
      throw new NotFoundException({
        message: this.i18n.t('comments.COMMENT_NOT_FOUND'),
      });
    }

    if (comment.authorId !== currentUserId) {
      throw new ForbiddenException({
        message: this.i18n.t('comments.COMMENT_FORBIDDEN'),
      });
    }

    await this.commentRepository.delete({
      id: comment.id,
      articleId: article.id,
    });
  }

  private async findArticleBySlugOrFail(slug: string): Promise<Article> {
    const article = await this.articleRepository.findOne({
      select: { id: true },
      where: { slug },
    });

    if (!article) {
      throw new NotFoundException({
        message: this.i18n.t('articles.ARTICLE_NOT_FOUND'),
      });
    }

    return article;
  }
}
