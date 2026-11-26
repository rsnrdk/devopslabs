import { loadConfig } from './app-config.js';

const base = { ADMIN_TOKEN: 'token', DB_PASSWORD: 'secret' };

describe('loadConfig', () => {
  it('reads values from the environment (ConfigMap + Secret)', () => {
    const config = loadConfig({
      ...base,
      APP_VERSION: '1.1.0',
      APP_ENV: 'minikube',
      APP_GREETING: 'Hi',
      HOSTNAME: 'nest-devops-7d9f-abcde',
      DB_HOST: 'postgres',
      DB_PORT: '5433',
    });

    expect(config.version).toBe('1.1.0');
    expect(config.environment).toBe('minikube');
    expect(config.greeting).toBe('Hi');
    expect(config.instance).toBe('nest-devops-7d9f-abcde');
    expect(config.database).toMatchObject({
      host: 'postgres',
      port: 5433,
      password: 'secret',
    });
  });

  it('uses defaults for optional values', () => {
    const config = loadConfig(base);

    expect(config.version).toBe('dev');
    expect(config.database.port).toBe(5432);
  });

  it('fails fast when a secret is missing', () => {
    expect(() => loadConfig({ ADMIN_TOKEN: 'token' })).toThrow('DB_PASSWORD');
    expect(() => loadConfig({ DB_PASSWORD: 'secret' })).toThrow('ADMIN_TOKEN');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, DB_PORT: 'abc' })).toThrow('DB_PORT');
  });
});
