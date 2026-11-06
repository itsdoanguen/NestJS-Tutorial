import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get Hello Message' })
  @ApiResponse({
    status: 200,
    description: 'Returns a hello message.',
    schema: { type: 'string', example: 'Hello, World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
