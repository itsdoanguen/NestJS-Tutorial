import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  const config = new DocumentBuilder()
    .setTitle('NestJS Tutorial API')
    .setDescription('The NestJS Tutorial API documentation')
    .setVersion('1.0')
    .addTag('app')
    .addTag('Auth')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'x-lang',
      in: 'header',
      required: false,
      description: 'Language code (en: English, vi: Tiếng Việt)',
      schema: {
        type: 'string',
        enum: ['en', 'vi'],
        default: 'en',
      },
    })
    .addTag('Attachments')
    .addTag('Users')
    .addTag('Profiles')
    .addTag('Articles')
    .addTag('Comments')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
}
await bootstrap();
