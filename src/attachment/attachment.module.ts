import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Attachment } from '../database/entities/attachment.entity.js';
import { AttachmentsController } from './attachment.controller.js';
import { AttachmentsService } from './attachment.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), AuthModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
