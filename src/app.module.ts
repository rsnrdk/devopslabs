import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { APP_CONFIG, loadConfig } from './config/app-config.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { VisitsService } from './visits/visits.service.js';

@Module({
  controllers: [AppController, HealthController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    DatabaseService,
    VisitsService,
  ],
})
export class AppModule {}
