import type { Attachment } from '../../database/entities/attachment.entity.js';
import type { AttachableType } from '../constants/attachment.constants.js';

export interface ReplaceAttachmentParams {
  file: Express.Multer.File;
  attachableId: string;
  attachableType: AttachableType;
  subDir: string;
}

export interface ReplaceAttachmentResult {
  attachment: Attachment;
  oldFilePaths: string[];
}
