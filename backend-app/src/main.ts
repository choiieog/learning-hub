import './config/load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { assertSecureSecrets } from './config/configuration';

async function bootstrap() {
  // Fail fast: production thiếu JWT secret thì không được chạy với secret dev.
  assertSecureSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers: chặn MIME sniffing, giới hạn referrer, tắt x-powered-by…
  // CSP tắt ở API vì HTML do nginx/Angular phục vụ (xem frontend-app/nginx.conf);
  // crossOriginResourcePolicy mở để <img>/<a> ở origin frontend đọc được /api/files.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Every endpoint lives under /api (e.g. GET /api/documents)
  app.setGlobalPrefix('api');

  // Allow the Angular dev server to call the API (cookie refresh token cần credentials: true)
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200').split(','),
    credentials: true,
  });

  // Sau reverse proxy: bật TRUST_PROXY=true để Express lấy IP thật từ X-Forwarded-For,
  // nếu không rate limit theo IP sẽ gộp mọi người vào IP của proxy.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Strips unknown fields and validates DTOs (class-validator decorators)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
