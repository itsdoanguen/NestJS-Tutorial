import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Article } from '../database/entities/article.entity.js';
import { Comment } from '../database/entities/comment.entity.js';
import { Follow } from '../database/entities/follow.entity.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Article, Follow]), AuthModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
