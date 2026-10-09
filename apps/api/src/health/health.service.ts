import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DbStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  db: { status: DbStatus; postgis: string | null; error?: string };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    let db: HealthResponse['db'] = { status: 'down', postgis: null };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      let postgis: string | null = null;
      try {
        const rows = await this.prisma.$queryRaw<
          { version: string }[]
        >`SELECT postgis_version() AS version`;
        postgis = rows[0]?.version ?? null;
      } catch {
        postgis = null; // extension not enabled (yet)
      }
      db = { status: 'up', postgis };
    } catch (error) {
      const message = (error as Error).message.replace(/\s+/g, ' ').trim();
      db = { status: 'down', postgis: null, error: message || 'database unreachable' };
    }

    return {
      status: db.status === 'up' ? 'ok' : 'degraded',
      service: 'e-plantshopping-api',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      db,
    };
  }
}
