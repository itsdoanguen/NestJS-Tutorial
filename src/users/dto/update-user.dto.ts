import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BIO_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  IMAGE_URL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from '../constants/users.constants.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'newmail@example.com' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: 'new_username' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAX_LENGTH)
  username?: string;

  @ApiPropertyOptional({ example: 'newpassword123' })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({ example: 'Backend developer', nullable: true })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  bio?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(IMAGE_URL_MAX_LENGTH)
  image?: string | null;
}
