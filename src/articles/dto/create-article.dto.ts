import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  DESCRIPTION_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../constants/articles.constants.js';

export class CreateArticleDto {
  @ApiProperty({ example: 'How to train your dragon' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: 'Ever wonder how?' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiProperty({ example: 'You have to believe' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiPropertyOptional({ example: ['reactjs', 'angularjs', 'dragons'] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (!Array.isArray(value)) {
      return value;
    }
    const normalized = value.map((item) =>
      typeof item === 'string' ? item.trim() : item,
    );
    return Array.from(new Set(normalized));
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(TAG_MAX_LENGTH, { each: true })
  tagList?: string[];
}
