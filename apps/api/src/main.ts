import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { text } from 'express';
import { AppModule } from './app.module';
import { securityHeaders } from './common/security-headers.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(securityHeaders);

  // ZKTeco ADMS devices POST attendance data as Content-Type: text/plain,
  // not JSON — give that path its own raw-text body parser so req.body is
  // the literal string the device sent (Nest's default JSON parser just
  // no-ops for non-JSON content types, so this doesn't conflict with it).
  app.use('/iclock', text({ type: '*/*', limit: '5mb' }));

  // Global URL prefix so every route lives under /api — except /iclock/*,
  // which device firmware hits at a hardcoded root-relative path with no
  // way to configure a prefix (see iclock.controller.ts).
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'iclock/(.*)', method: RequestMethod.ALL }],
  });

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
