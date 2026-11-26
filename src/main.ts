import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Kubernetes stops a pod with SIGTERM: close the HTTP server and the DB pool cleanly
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `Listening on port ${port}, version ${process.env.APP_VERSION ?? 'dev'}`,
    'Bootstrap',
  );
}
await bootstrap();
