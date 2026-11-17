import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { I18nService } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Attachment } from '../database/entities/attachment.entity.js';
import { User } from '../database/entities/user.entity.js';
import { AttachmentsService } from './attachment.service.js';
import {
  ATTACHABLE_TYPE,
  AVATAR_SUBDIR,
} from './constants/attachment.constants.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let attachmentRepository: any;
  let configService: any;
  let i18nService: any;
  let tempUploadDir: string;

  beforeEach(async () => {
    tempUploadDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'nest-attachment-unit-'),
    );

    attachmentRepository = {
      findOne: vi.fn(),
    };

    configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'UPLOAD_DIR') {
          return tempUploadDir;
        }
        if (key === 'UPLOAD_MAX_FILE_SIZE') {
          return 2097152;
        }
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };

    i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        {
          provide: getRepositoryToken(Attachment),
          useValue: attachmentRepository,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: I18nService,
          useValue: i18nService,
        },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
  });

  afterEach(async () => {
    await fs.rm(tempUploadDir, { recursive: true, force: true });
  });

  const buildMockFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'avatar',
      originalname: '../../evil name.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: PNG_BUFFER.length,
      buffer: PNG_BUFFER,
      destination: '',
      filename: '',
      path: '',
      stream: undefined as any,
      ...overrides,
    }) as Express.Multer.File;

  describe('replaceAttachment', () => {
    it('should validate magic bytes, write file with UUID, replace old record, and return oldFilePaths', async () => {
      const manager: any = {
        find: vi.fn().mockResolvedValue([
          {
            id: 'old-id',
            filePath: path.join(AVATAR_SUBDIR, 'old-id.png'),
          },
        ]),
        create: vi.fn((_entity, data) => ({ ...data })),
        save: vi.fn(async (_entity, data) => data),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const result = await service.replaceAttachment(manager, {
        file: buildMockFile(),
        attachableId: '1',
        attachableType: ATTACHABLE_TYPE.USER,
        subDir: AVATAR_SUBDIR,
      });

      expect(result.attachment.url).toBe(
        `/api/attachments/${result.attachment.id}`,
      );
      expect(result.attachment.fileName).toBe('evil_name.png');
      expect(result.oldFilePaths).toEqual([
        path.join(AVATAR_SUBDIR, 'old-id.png'),
      ]);
      expect(manager.find).toHaveBeenCalledWith(Attachment, {
        select: {
          id: true,
          filePath: true,
        },
        where: {
          attachableType: ATTACHABLE_TYPE.USER,
          attachableId: '1',
        },
      });
      expect(manager.delete).toHaveBeenCalledWith(Attachment, ['old-id']);

      const writtenPath = path.join(tempUploadDir, result.attachment.filePath);
      const writtenContent = await fs.readFile(writtenPath);
      expect(writtenContent).toEqual(PNG_BUFFER);
    });

    it('should reject spoofed files whose magic bytes do not match image types', async () => {
      const manager: any = {};
      const spoofedFile = buildMockFile({
        mimetype: 'image/png',
        buffer: Buffer.from('not-actually-a-png-file'),
      });

      await expect(
        service.replaceAttachment(manager, {
          file: spoofedFile,
          attachableId: '1',
          attachableType: ATTACHABLE_TYPE.USER,
          subDir: AVATAR_SUBDIR,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject files exceeding UPLOAD_MAX_FILE_SIZE', async () => {
      const manager: any = {};
      const oversizedFile = buildMockFile({
        size: 3 * 1024 * 1024,
      });

      await expect(
        service.replaceAttachment(manager, {
          file: oversizedFile,
          attachableId: '1',
          attachableType: ATTACHABLE_TYPE.USER,
          subDir: AVATAR_SUBDIR,
        }),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('should clean up the newly written file if database save fails', async () => {
      const manager: any = {
        find: vi.fn().mockResolvedValue([]),
        create: vi.fn((_entity, data) => ({ ...data })),
        save: vi.fn().mockRejectedValue(new Error('DB failure')),
      };

      await expect(
        service.replaceAttachment(manager, {
          file: buildMockFile(),
          attachableId: '1',
          attachableType: ATTACHABLE_TYPE.USER,
          subDir: AVATAR_SUBDIR,
        }),
      ).rejects.toThrow('DB failure');

      const avatarDirFiles = await fs.readdir(
        path.join(tempUploadDir, AVATAR_SUBDIR),
      );
      expect(avatarDirFiles).toHaveLength(0);
    });
  });

  describe('getAttachmentStream', () => {
    const mockUser = { id: 1 } as User;
    const otherUser = { id: 2 } as User;

    it('should throw NotFoundException when attachment does not exist in DB', async () => {
      attachmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAttachmentStream('nonexistent-uuid', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow another authenticated user to read a User avatar (Option B)', async () => {
      const relPath = path.join(AVATAR_SUBDIR, 'test-avatar.png');
      const fullPath = path.join(tempUploadDir, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, PNG_BUFFER);

      attachmentRepository.findOne.mockResolvedValue({
        id: 'test-avatar-uuid',
        attachableId: '1',
        attachableType: ATTACHABLE_TYPE.USER,
        fileName: 'avatar.png',
        filePath: relPath,
        fileType: 'image/png',
        fileSize: PNG_BUFFER.length,
      });

      const result = await service.getAttachmentStream(
        'test-avatar-uuid',
        otherUser,
      );

      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders()).toEqual({
        type: 'image/png',
        disposition: 'inline; filename="avatar.png"',
        length: PNG_BUFFER.length,
      });
      result.getStream().destroy();
    });

    it('should throw ForbiddenException when non-owner tries to access non-User attachment', async () => {
      attachmentRepository.findOne.mockResolvedValue({
        id: 'private-doc-uuid',
        attachableId: '1',
        attachableType: ATTACHABLE_TYPE.POST,
        fileName: 'secret.png',
        filePath: path.join(AVATAR_SUBDIR, 'secret.png'),
        fileType: 'image/png',
        fileSize: PNG_BUFFER.length,
      });

      await expect(
        service.getAttachmentStream('private-doc-uuid', otherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException on path traversal attempt in stored filePath', async () => {
      attachmentRepository.findOne.mockResolvedValue({
        id: 'traversal-uuid',
        attachableId: '1',
        attachableType: ATTACHABLE_TYPE.USER,
        fileName: 'evil.png',
        filePath: '../../etc/passwd',
        fileType: 'image/png',
        fileSize: 100,
      });

      await expect(
        service.getAttachmentStream('traversal-uuid', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
