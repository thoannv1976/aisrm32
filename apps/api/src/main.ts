import './env';
import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { config } from './infra';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.APP_ENV === 'test' ? ['error', 'warn'] : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(/[,;]/);
  app.enableCors({
    origin: origins,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AI-SRM API')
      .setDescription('API nghiệp vụ AI-SRM. Mọi endpoint (trừ /health) yêu cầu Firebase ID token và header X-Tenant-Id.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
  // Tác vụ nền: mặc định bật ở bản Local (máy chủ chạy liên tục), tắt ở Online (Cloud Run có thể ngủ khi rảnh).
  process.env.SCHEDULER_ENABLED ??= config.deployTarget === 'local' ? 'true' : 'false';
  if (process.env.SCHEDULER_ENABLED === 'true') {
    await import('./jobs/reminders');
    (await import('./jobs/scheduler')).startScheduler();
  }
  Logger.log(
    `AI-SRM API chạy tại http://localhost:${port}/api/v1 (env=${config.appEnv}, emulators=${config.usingEmulators}, project=${config.projectId})`,
    'Bootstrap',
  );
}

if (require.main === module) {
  void bootstrap();
}
