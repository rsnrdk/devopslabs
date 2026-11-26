import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { APP_CONFIG, loadConfig } from '../src/config/app-config.js';
import { DatabaseService } from '../src/database/database.service.js';

/** In-memory stand-in for Postgres, so the e2e test needs no database. */
class FakeDatabase {
  up = true;
  rows: { instance: string; version: string }[] = [];

  async ping() {
    if (!this.up) {
      throw new Error('connection refused');
    }
  }

  async query(sql: string, params: unknown[] = []) {
    await this.ping();
    if (sql.startsWith('INSERT')) {
      this.rows.push({
        instance: String(params[0]),
        version: String(params[1]),
      });
      return [];
    }
    if (sql.includes('AS total')) {
      return [{ total: String(this.rows.length) }];
    }
    if (sql.includes('DELETE')) {
      const deleted = this.rows.length;
      this.rows = [];
      return [{ deleted: String(deleted) }];
    }
    return this.rows.length
      ? [
          {
            instance: this.rows[0].instance,
            version: this.rows[0].version,
            count: String(this.rows.length),
          },
        ]
      : [];
  }
}

describe('nest-devops (e2e)', () => {
  let app: INestApplication<App>;
  let db: FakeDatabase;

  beforeEach(async () => {
    db = new FakeDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(
        loadConfig({
          ADMIN_TOKEN: 'admin-test',
          DB_PASSWORD: 'p',
          APP_VERSION: '1.2.3',
          HOSTNAME: 'pod-x',
        }),
      )
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /version returns the image version', () => {
    return request(app.getHttpServer())
      .get('/version')
      .expect(200)
      .expect({ version: '1.2.3' });
  });

  it('GET / renders the page and records a visit', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);

    expect(res.text).toContain('v1.2.3');
    expect(res.text).toContain('pod-x');
    expect(db.rows).toHaveLength(1);
  });

  it('GET /api/info closes the connection so requests spread across pods', async () => {
    const res = await request(app.getHttpServer()).get('/api/info').expect(200);

    expect(res.headers.connection).toBe('close');
    expect(res.body.instance).toBe('pod-x');
  });

  it('liveness does not depend on the database, readiness does', async () => {
    db.up = false;

    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/health/ready').expect(503);
    db.up = true;
    await request(app.getHttpServer()).get('/health/ready').expect(200);
  });

  it('DELETE /api/visits requires the admin token from the Secret', async () => {
    await request(app.getHttpServer()).get('/');

    await request(app.getHttpServer()).delete('/api/visits').expect(401);
    await request(app.getHttpServer())
      .delete('/api/visits')
      .set('x-admin-token', 'wrong')
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/visits')
      .set('x-admin-token', 'admin-test')
      .expect(200)
      .expect({ deleted: 1 });
  });
});
