import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health returns a status payload', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.service).toBe('e-plantshopping-api');
    expect(['ok', 'degraded']).toContain(res.body.status);
    expect(res.body.db).toHaveProperty('status');
  });
});
