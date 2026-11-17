import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { User } from '../database/entities/user.entity.js';
import type { ProfileResponse } from './interfaces/profile-response.interface.js';
import { ProfilesService } from './profiles.service.js';

@ApiTags('Profiles')
@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile by username' })
  @ApiResponse({ status: 200, description: 'Return user profile' })
  @ApiResponse({ status: 401, description: 'Invalid or revoked token' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfile(
    @Param('username') username: string,
    @CurrentUser() currentUser?: User,
  ): Promise<{ profile: ProfileResponse }> {
    return this.profilesService.getProfile(username, currentUser?.id);
  }

  @Post(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user' })
  @ApiResponse({ status: 200, description: 'Followed user successfully' })
  @ApiResponse({ status: 400, description: 'Cannot follow yourself' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async followUser(
    @Param('username') username: string,
    @CurrentUser() currentUser: User,
  ): Promise<{ profile: ProfileResponse }> {
    return this.profilesService.followUser(username, currentUser.id);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiResponse({ status: 200, description: 'Unfollowed user successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async unfollowUser(
    @Param('username') username: string,
    @CurrentUser() currentUser: User,
  ): Promise<{ profile: ProfileResponse }> {
    return this.profilesService.unfollowUser(username, currentUser.id);
  }
}
