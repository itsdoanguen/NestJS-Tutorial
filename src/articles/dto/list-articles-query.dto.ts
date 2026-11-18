import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { FeedArticlesQueryDto } from './feed-articles-query.dto.js';

export class ListArticlesQueryDto extends FeedArticlesQueryDto {
  @ApiPropertyOptional({ example: 'dragons' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: 'jake' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  author?: string;

  @ApiPropertyOptional({ example: 'alice' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  favorited?: string;
}
