import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { maxUploadSizeBytes } from '../constants/upload.constants';

/**
 * Chuẩn hóa mọi lỗi thành:
 * { success: false, statusCode, message, path, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage =
      typeof payload === 'string'
        ? payload
        : ((payload as { message?: string | string[] } | null)?.message ?? 'Lỗi hệ thống');
    // Multer báo "File too large" bằng tiếng Anh — đổi sang câu tiếng Việt cho UI.
    const message =
      status === HttpStatus.PAYLOAD_TOO_LARGE && rawMessage === 'File too large'
        ? `File vượt quá ${Math.round(maxUploadSizeBytes() / 1024 / 1024)}MB.`
        : rawMessage;

    // Machine-readable error code, e.g. EMAIL_NOT_VERIFIED on login.
    const code =
      typeof payload === 'object' && payload !== null && 'code' in payload
        ? (payload as { code?: string }).code
        : undefined;

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
