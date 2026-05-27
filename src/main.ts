import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  // ─── CORS: allow localhost + any local network IP ─────────────────────────
  app.enableCors({
    origin: true, // reflects the request origin — safe for local dev
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Global validation pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // ─── Global exception filter (logs all errors to terminal) ───────────────
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 LMS Backend running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
