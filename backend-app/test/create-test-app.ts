import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * Cấu hình app giống `src/main.ts` (prefix /api, validate DTO, bọc response, chuẩn hoá lỗi)
 * để e2e test đi đúng đường mà frontend thật sử dụng.
 *
 * `main.ts` không export được bootstrap (chạy listen ngay), nên phần cấu hình thuần
 * được lặp lại ở đây — khi sửa main.ts nhớ sửa cả file này.
 */
export function applyAppSettings(app: INestApplication): void {
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
