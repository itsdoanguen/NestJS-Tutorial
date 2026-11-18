import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../constants/articles.constants.js';

export class UpdateArticleDto {
  @ApiPropertyOptional({ example: 'Did you train your dragon?' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ example: 'Updated body content' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  body?: string;
}
