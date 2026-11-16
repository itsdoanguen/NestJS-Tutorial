import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { User } from '../database/entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, AttachmentsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
