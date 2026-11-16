import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class Migration1794824467879 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'password_changed_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'follows',
        columns: [
          {
            name: 'follower_id',
            type: 'int',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'following_id',
            type: 'int',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            name: 'FK_follows_follower_id',
            columnNames: ['follower_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_follows_following_id',
            columnNames: ['following_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        checks: [
          {
            name: 'CHK_follows_not_self',
            expression: 'follower_id <> following_id',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'attachments',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'attachable_id',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'attachable_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'file_path',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'file_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'file_size',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_attachments_attachable',
            columnNames: ['attachable_type', 'attachable_id'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('attachments', true);
    await queryRunner.dropTable('follows', true);
    await queryRunner.dropColumn('users', 'password_changed_at');
  }
}
