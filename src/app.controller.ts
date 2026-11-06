import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get Hello Message' })
  @ApiQuery({
    name: 'lang',
    required: false,
    description: 'Language code for translation (e.g., en, es, fr).',
    example: 'en',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a hello message.',
    schema: { type: 'string', example: 'Hello, World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
