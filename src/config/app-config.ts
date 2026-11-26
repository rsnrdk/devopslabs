import { hostname } from 'node:os';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
}

export interface AppConfig {
  /** Version baked into the Docker image at build time (APP_VERSION build arg). */
  version: string;
  /** dev / prod / minikube - comes from the ConfigMap. */
  environment: string;
  /** Text shown on the page - comes from the ConfigMap. */
  greeting: string;
  /** Pod name: Kubernetes sets the container hostname to the pod name. */
  instance: string;
  /** Token for the admin endpoint - comes from the Secret. */
  adminToken: string;
  database: DatabaseConfig;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

function port(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${key} must be a port number, got '${raw}'`);
  }
  return value;
}

/**
 * Reads all settings from environment variables once, at startup.
 * A missing secret stops the app immediately instead of failing later on the first request.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    version: env.APP_VERSION ?? 'dev',
    environment: env.APP_ENV ?? 'local',
    greeting: env.APP_GREETING ?? 'Hello from Nest.js',
    instance: env.HOSTNAME ?? hostname(),
    adminToken: required(env, 'ADMIN_TOKEN'),
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: port(env, 'DB_PORT', 5432),
      name: env.DB_NAME ?? 'app',
      user: env.DB_USER ?? 'app',
      password: required(env, 'DB_PASSWORD'),
    },
  };
}
