import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/**
 * Two different questions for Kubernetes:
 *  - liveness:  "is the process alive?"         no  -> container is restarted
 *  - readiness: "can it serve traffic right now?" no -> pod is removed from the Service
 * Liveness must NOT depend on the database, otherwise a database outage would restart every pod.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.db.ping();
      return { status: 'ok', database: 'up' };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
