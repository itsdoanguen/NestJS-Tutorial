import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH } from '../constants/comments.constants.js';

export class CreateCommentDto {
  @ApiProperty({ example: 'His name was my name too.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body: string;
}
