import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { ArticlesService } from '../articles/articles.service.js';
import { Comment } from '../database/entities/comment.entity.js';
import { User } from '../database/entities/user.entity.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { buildCommentResponse } from './helpers/comment.helper.js';
import type { CommentResponse } from './interfaces/comment-response.interface.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly articlesService: ArticlesService,
    private readonly profilesService: ProfilesService,
    private readonly i18n: I18nService,
  ) {}

  async addComment(
    slug: string,
    currentUser: User,
    dto: CreateCommentDto,
  ): Promise<{ comment: CommentResponse }> {
    const articleId =
      await this.articlesService.findArticleIdBySlugOrFail(slug);

    const comment = this.commentRepository.create({
      body: dto.body,
      articleId,
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
    const articleId =
      await this.articlesService.findArticleIdBySlugOrFail(slug);

    const comments = await this.commentRepository
      .createQueryBuilder('comment')
      .leftJoin('comment.author', 'author')
      .addSelect(['author.id', 'author.username', 'author.bio', 'author.image'])
      .where('comment.articleId = :articleId', { articleId })
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .getMany();

    if (comments.length === 0) {
      return { comments: [] };
    }

    const followedAuthorIds = await this.profilesService.getFollowedUserIds(
      currentUserId,
      comments.map((comment) => comment.authorId),
    );

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
    const articleId =
      await this.articlesService.findArticleIdBySlugOrFail(slug);

    const comment = await this.commentRepository.findOne({
      select: { id: true, authorId: true },
      where: { id: commentId, articleId },
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
      articleId,
    });
  }
}
