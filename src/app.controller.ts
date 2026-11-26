import {
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Logger,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { VisitsService, type VisitStats } from './visits/visits.service.js';
import { renderPage } from './web/page.js';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly visits: VisitsService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async page(): Promise<string> {
    let stats: VisitStats | null = null;
    try {
      await this.visits.record();
      stats = await this.visits.stats();
    } catch (err) {
      this.logger.warn(
        `Visits are unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return renderPage(this.config, stats);
  }

  @Get('version')
  version() {
    return { version: this.config.version };
  }

  /**
   * "Connection: close" makes every request open a new TCP connection,
   * so the Service can send each one to a different pod (otherwise keep-alive sticks to one pod).
   */
  @Get('api/info')
  info(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Connection', 'close');
    return {
      version: this.config.version,
      environment: this.config.environment,
      greeting: this.config.greeting,
      instance: this.config.instance,
    };
  }

  @Get('api/visits')
  stats(): Promise<VisitStats> {
    return this.visits.stats();
  }

  /** Protected by ADMIN_TOKEN from the Secret: shows that the secret really reached the container. */
  @Delete('api/visits')
  async reset(@Headers('x-admin-token') token: string | undefined) {
    if (!this.isAdmin(token)) {
      throw new UnauthorizedException('Invalid admin token');
    }
    return { deleted: await this.visits.reset() };
  }

  private isAdmin(token: string | undefined): boolean {
    if (!token) {
      return false;
    }
    const given = Buffer.from(token);
    const expected = Buffer.from(this.config.adminToken);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
