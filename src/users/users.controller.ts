import {
  Body,
  Controller,
  Header,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';
import type { UserResponse } from '../auth/interfaces/user-response.interface.js';
import { User } from '../database/entities/user.entity.js';
import {
  AVATAR_FIELD_NAME,
  MAX_MULTIPART_FILE_BYTES,
  MAX_UPLOAD_FILES,
} from './constants/users.constants.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller('api/user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @UseInterceptors(
    FileInterceptor(AVATAR_FIELD_NAME, {
      limits: {
        files: MAX_UPLOAD_FILES,
        fileSize: MAX_MULTIPART_FILE_BYTES,
      },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        username: { type: 'string' },
        password: { type: 'string' },
        bio: { type: 'string', nullable: true },
        image: { type: 'string', nullable: true },
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Update current user profile and optional avatar' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or file type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  @ApiResponse({ status: 413, description: 'File too large' })
  async updateUser(
    @CurrentUser() currentUser: User,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ): Promise<{ user: UserResponse }> {
    return this.usersService.updateUser(
      currentUser,
      dto,
      avatarFile,
      req.tokenPayload,
      req.token,
    );
  }
}
