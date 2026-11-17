import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { I18nService } from 'nestjs-i18n';
import { EntityManager, Repository } from 'typeorm';
import { Attachment } from '../database/entities/attachment.entity.js';
import { User } from '../database/entities/user.entity.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ATTACHABLE_TYPE,
  ATTACHMENT_URL_PREFIX,
  IMAGE_MIME,
  MIME_TO_EXTENSION,
  WEBP_FORMAT_SIGNATURE,
  WEBP_RIFF_SIGNATURE,
} from './constants/attachment.constants.js';
import type {
  ReplaceAttachmentParams,
  ReplaceAttachmentResult,
} from './interfaces/attachment-upload.interface.js';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async replaceAttachment(
    manager: EntityManager,
    params: ReplaceAttachmentParams,
  ): Promise<ReplaceAttachmentResult> {
    const detectedMime = this.validateImageFile(params.file);
    const ext = MIME_TO_EXTENSION[detectedMime];
    const id = crypto.randomUUID();
    const relativePath = path.join(params.subDir, `${id}.${ext}`);
    const safePath = this.resolveSafePath(relativePath);

    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, params.file.buffer);

    try {
      const oldAttachments = await manager.find(Attachment, {
        select: {
          id: true,
          filePath: true,
        },
        where: {
          attachableType: params.attachableType,
          attachableId: params.attachableId,
        },
      });

      const attachment = manager.create(Attachment, {
        id,
        attachableId: params.attachableId,
        attachableType: params.attachableType,
        url: `${ATTACHMENT_URL_PREFIX}/${id}`,
        fileName: this.sanitizeFileName(params.file.originalname, ext),
        filePath: relativePath,
        fileType: detectedMime,
        fileSize: params.file.size,
      });

      const savedAttachment = await manager.save(Attachment, attachment);

      if (oldAttachments.length > 0) {
        await manager.delete(
          Attachment,
          oldAttachments.map((item) => item.id),
        );
      }

      return {
        attachment: savedAttachment,
        oldFilePaths: oldAttachments.map((item) => item.filePath),
      };
    } catch (error) {
      await this.deleteFilesSafely([relativePath]);
      throw error;
    }
  }

  async getAttachmentStream(
    id: string,
    currentUser: User,
  ): Promise<StreamableFile> {
    const attachment = await this.attachmentRepository.findOne({
      select: {
        attachableId: true,
        attachableType: true,
        fileName: true,
        filePath: true,
        fileType: true,
        fileSize: true,
      },
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException({
        message: this.i18n.t('attachments.ATTACHMENT_NOT_FOUND'),
      });
    }

    const isOwner = attachment.attachableId === String(currentUser.id);
    const isReadableAvatar = attachment.attachableType === ATTACHABLE_TYPE.USER;

    if (!isOwner && !isReadableAvatar) {
      throw new ForbiddenException({
        message: this.i18n.t('attachments.ATTACHMENT_FORBIDDEN'),
      });
    }

    const safePath = this.resolveSafePath(attachment.filePath);

    try {
      await fs.access(safePath);
    } catch {
      throw new NotFoundException({
        message: this.i18n.t('attachments.ATTACHMENT_NOT_FOUND'),
      });
    }

    return new StreamableFile(createReadStream(safePath), {
      type: attachment.fileType,
      disposition: `inline; filename="${attachment.fileName}"`,
      length: attachment.fileSize,
    });
  }

  async deleteFilesSafely(relativePaths: string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      try {
        const safePath = this.resolveSafePath(relativePath);
        await fs.unlink(safePath);
      } catch (error) {
        this.logger.warn(
          `Failed to delete local attachment file: ${relativePath}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private validateImageFile(file: Express.Multer.File): string {
    const maxFileSize = this.configService.getOrThrow<number>(
      'UPLOAD_MAX_FILE_SIZE',
    );
    if (file.size > maxFileSize) {
      throw new PayloadTooLargeException({
        message: this.i18n.t('attachments.FILE_TOO_LARGE'),
      });
    }

    const detectedMime = this.detectImageMime(file.buffer);
    if (
      !detectedMime ||
      !ALLOWED_IMAGE_MIME_TYPES.includes(detectedMime) ||
      file.mimetype !== detectedMime
    ) {
      throw new BadRequestException({
        message: this.i18n.t('attachments.INVALID_FILE_TYPE'),
      });
    }

    return detectedMime;
  }

  private detectImageMime(buffer: Buffer): string | null {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return IMAGE_MIME.JPEG;
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return IMAGE_MIME.PNG;
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === WEBP_RIFF_SIGNATURE &&
      buffer.subarray(8, 12).toString('ascii') === WEBP_FORMAT_SIGNATURE
    ) {
      return IMAGE_MIME.WEBP;
    }

    return null;
  }

  private sanitizeFileName(originalName: string, ext: string): string {
    const baseName = path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    return baseName || `file.${ext}`;
  }

  private getUploadRoot(): string {
    const uploadDir = this.configService.getOrThrow<string>('UPLOAD_DIR');
    return path.resolve(process.cwd(), uploadDir);
  }

  private resolveSafePath(relativePath: string): string {
    const root = this.getUploadRoot();
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(root + path.sep)) {
      throw new BadRequestException({
        message: this.i18n.t('attachments.ATTACHMENT_NOT_FOUND'),
      });
    }
    return resolved;
  }
}
