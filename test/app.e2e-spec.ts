import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) - default language (en)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/ (GET) - query ?lang=vi returns Vietnamese', () => {
    return request(app.getHttpServer())
      .get('/?lang=vi')
      .expect(200)
      .expect('Xin chào thế giới!');
  });

  it('/ (GET) - header Accept-Language: vi returns Vietnamese', () => {
    return request(app.getHttpServer())
      .get('/')
      .set('Accept-Language', 'vi')
      .expect(200)
      .expect('Xin chào thế giới!');
  });

  it('/ (GET) - unsupported language (?lang=fr) falls back to English', () => {
    return request(app.getHttpServer())
      .get('/?lang=fr')
      .expect(200)
      .expect('Hello World!');
  });
});
