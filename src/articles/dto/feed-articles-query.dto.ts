import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_ARTICLES_LIMIT,
  DEFAULT_ARTICLES_OFFSET,
  MAX_ARTICLES_LIMIT,
} from '../constants/articles.constants.js';

export class FeedArticlesQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_ARTICLES_LIMIT,
    minimum: 1,
    maximum: MAX_ARTICLES_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ARTICLES_LIMIT)
  limit?: number = DEFAULT_ARTICLES_LIMIT;

  @ApiPropertyOptional({
    default: DEFAULT_ARTICLES_OFFSET,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = DEFAULT_ARTICLES_OFFSET;
}
