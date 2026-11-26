import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { DatabaseService } from '../database/database.service.js';

export interface VisitStats {
  total: number;
  byInstance: { instance: string; version: string; count: number }[];
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async record(): Promise<void> {
    await this.db.query(
      'INSERT INTO visits (instance, version) VALUES ($1, $2)',
      [this.config.instance, this.config.version],
    );
  }

  async stats(): Promise<VisitStats> {
    const rows = await this.db.query<{
      instance: string;
      version: string;
      count: string;
    }>(
      `SELECT instance, version, count(*) AS count
         FROM visits
        GROUP BY instance, version
        ORDER BY max(created_at) DESC
        LIMIT 10`,
    );
    const [{ total }] = await this.db.query<{ total: string }>(
      'SELECT count(*) AS total FROM visits',
    );
    return {
      total: Number(total),
      byInstance: rows.map((r) => ({
        instance: r.instance,
        version: r.version,
        count: Number(r.count),
      })),
    };
  }

  async reset(): Promise<number> {
    const rows = await this.db.query<{ deleted: string }>(
      'WITH d AS (DELETE FROM visits RETURNING 1) SELECT count(*) AS deleted FROM d',
    );
    return Number(rows[0].deleted);
  }
}
