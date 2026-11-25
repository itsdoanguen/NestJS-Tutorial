import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { Comment } from '../database/entities/comment.entity.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    AuthModule,
    ArticlesModule,
    ProfilesModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
