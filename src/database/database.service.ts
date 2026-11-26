import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * Thin wrapper around a pg connection pool.
 * The app starts even when the database is not up yet: the readiness probe
 * keeps the pod out of the Service until ping() succeeds.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;
  private schemaReady = false;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const db = config.database;
    this.pool = new pg.Pool({
      host: db.host,
      port: db.port,
      database: db.name,
      user: db.user,
      password: db.password,
      max: 5,
      connectionTimeoutMillis: 2000,
    });
    this.pool.on('error', (err) =>
      this.logger.warn(`Idle client error: ${err.message}`),
    );
  }

  async query<T extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    await this.ensureSchema();
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  /** Used by the readiness probe. Throws when the database is unreachable. */
  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) {
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id         BIGSERIAL PRIMARY KEY,
        instance   TEXT        NOT NULL,
        version    TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    this.schemaReady = true;
    this.logger.log('Database schema is ready');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
