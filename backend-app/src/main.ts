import './config/load-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { UPLOAD_URL_PREFIX } from './common/constants/upload.constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Every endpoint lives under /api (e.g. GET /api/documents)
  app.setGlobalPrefix('api');

  // Allow the Angular dev server to call the API
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

  // File upload local: <UPLOAD_DIR>/documents/<uuid>.pdf → GET /api/files/documents/<uuid>.pdf
  // Nằm dưới /api để đi qua proxy sẵn có của frontend, không cần cấu hình thêm.
  app.useStaticAssets(resolve(process.env.UPLOAD_DIR ?? './uploads'), {
    prefix: UPLOAD_URL_PREFIX,
    index: false,
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
