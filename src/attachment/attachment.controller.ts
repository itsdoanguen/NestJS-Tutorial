import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { User } from '../database/entities/user.entity.js';
import { AttachmentsService } from './attachment.service.js';
import {
  HEADER_CONTENT_DISPOSITION,
  HEADER_CONTENT_LENGTH,
  HEADER_CONTENT_TYPE,
} from './constants/attachment.constants.js';

@ApiTags('Attachments')
@Controller('api/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Header('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Retrieve a private attachment file by UUID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Attachment file stream' })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  @ApiResponse({ status: 503, description: 'Redis is unavailable' })
  async getAttachment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() currentUser: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.attachmentsService.getAttachmentStream(
      id,
      currentUser,
    );

    res.setHeader(HEADER_CONTENT_TYPE, result.fileType);
    res.setHeader(HEADER_CONTENT_LENGTH, String(result.fileSize));
    res.setHeader(
      HEADER_CONTENT_DISPOSITION,
      `inline; filename="${result.fileName}"`,
    );

    return result.stream;
  }
}
