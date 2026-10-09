import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  const build = async (queryRaw: jest.Mock) => {
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    return moduleRef.get(HealthService);
  };

  it('reports ok when the database answers', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ version: '3.4 USE_GEOS=1' }]);
    const service = await build(queryRaw);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.db.status).toBe('up');
    expect(result.db.postgis).toBe('3.4 USE_GEOS=1');
  });

  it('reports degraded when the database is unreachable', async () => {
    const service = await build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.db.status).toBe('down');
    expect(result.db.error).toContain('ECONNREFUSED');
  });
});
