import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('attachments')
@Index('IDX_attachments_attachable', ['attachableType', 'attachableId'])
export class Attachment {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'attachable_id', type: 'varchar', length: 64 })
  attachableId: string;

  @Column({ name: 'attachable_type', type: 'varchar', length: 50 })
  attachableType: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  @Column({ name: 'file_type', type: 'varchar', length: 100 })
  fileType: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
