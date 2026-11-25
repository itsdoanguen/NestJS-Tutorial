import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH } from '../constants/comments.constants.js';

export class CreateCommentDto {
  @ApiProperty({ example: 'His name was my name too.' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body: string;
}
