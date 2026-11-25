import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
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
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import type { CommentResponse } from './interfaces/comment-response.interface.js';

@ApiTags('Comments')
@Controller('api/articles/:slug/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment to an article' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async addComment(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: User,
    @Body() dto: CreateCommentDto,
  ): Promise<{ comment: CommentResponse }> {
    return this.commentsService.addComment(slug, currentUser, dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comments from an article' })
  @ApiResponse({ status: 200, description: 'Return comments list' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked token' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getComments(
    @Param('slug') slug: string,
    @CurrentUser() currentUser?: User,
  ): Promise<{ comments: CommentResponse[] }> {
    return this.commentsService.getComments(slug, currentUser?.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment from an article' })
  @ApiResponse({ status: 204, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid comment ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Article or comment not found' })
  async deleteComment(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: User,
  ): Promise<void> {
    return this.commentsService.deleteComment(slug, id, currentUser.id);
  }
}
