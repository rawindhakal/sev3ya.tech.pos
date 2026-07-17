import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global URL prefix so every route lives under /api.
  app.setGlobalPrefix('api');

  // Validate + transform all incoming DTOs automatically.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    // Allow configured origins plus any tenant subdomain (*.s3vya.tech).
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin) || /^https:\/\/[a-z0-9-]+\.s3vya\.tech$/.test(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Tenant'],
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🍰 CakeZake POS API running on http://localhost:${port}/api`);
}
bootstrap();
