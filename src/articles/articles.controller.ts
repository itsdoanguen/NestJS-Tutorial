import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { User } from '../database/entities/user.entity.js';
import { ArticlesService } from './articles.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { FeedArticlesQueryDto } from './dto/feed-articles-query.dto.js';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import type {
  ArticleResponse,
  ArticlesListResponse,
} from './interfaces/article-response.interface.js';

@ApiTags('Articles')
@Controller('api/articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new article' })
  @ApiResponse({ status: 201, description: 'Article created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createArticle(
    @CurrentUser() currentUser: User,
    @Body() dto: CreateArticleDto,
  ): Promise<{ article: ArticleResponse }> {
    return this.articlesService.createArticle(currentUser, dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List articles with optional filters' })
  @ApiResponse({ status: 200, description: 'Return list of articles' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked token' })
  async listArticles(
    @Query() query: ListArticlesQueryDto,
    @CurrentUser() currentUser?: User,
  ): Promise<ArticlesListResponse> {
    return this.articlesService.listArticles(query, currentUser?.id);
  }

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent articles from followed users' })
  @ApiResponse({ status: 200, description: 'Return feed articles' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async feedArticles(
    @CurrentUser() currentUser: User,
    @Query() query: FeedArticlesQueryDto,
  ): Promise<ArticlesListResponse> {
    return this.articlesService.feedArticles(currentUser.id, query);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single article by slug' })
  @ApiResponse({ status: 200, description: 'Return article' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked token' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser?: User,
  ): Promise<{ article: ArticleResponse }> {
    return this.articlesService.getArticle(slug, currentUser?.id);
  }

  @Put(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an article by slug' })
  @ApiResponse({ status: 200, description: 'Article updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async updateArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: User,
    @Body() dto: UpdateArticleDto,
  ): Promise<{ article: ArticleResponse }> {
    return this.articlesService.updateArticle(slug, currentUser, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an article by slug' })
  @ApiResponse({ status: 204, description: 'Article deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async deleteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    return this.articlesService.deleteArticle(slug, currentUser);
  }

  @Post(':slug/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Favorite an article' })
  @ApiResponse({ status: 200, description: 'Article favorited successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async favoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: User,
  ): Promise<{ article: ArticleResponse }> {
    return this.articlesService.favoriteArticle(slug, currentUser.id);
  }

  @Delete(':slug/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfavorite an article' })
  @ApiResponse({ status: 200, description: 'Article unfavorited successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async unfavoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: User,
  ): Promise<{ article: ArticleResponse }> {
    return this.articlesService.unfavoriteArticle(slug, currentUser.id);
  }
}
