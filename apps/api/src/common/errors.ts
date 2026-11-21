import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (message = 'Không tìm thấy dữ liệu hoặc bạn không có quyền xem.') =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

/** Chuẩn lỗi thống nhất {code,message,requestId,details}; không lộ stack trace. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? '-';

    if (exception instanceof AppError) {
      return res.status(exception.getStatus()).json({
        code: exception.code,
        message: exception.message,
        requestId,
        details: exception.details,
      });
    }
    if (exception instanceof ZodError) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        requestId,
        details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      return res.status(status).json({
        code: status === 413 ? 'PAYLOAD_TOO_LARGE' : HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
        requestId,
      });
    }
    // Firestore hủy transaction do tranh chấp ghi (ABORTED = 10) sau khi đã thử lại: không có thay đổi nào được ghi.
    if ((exception as { code?: unknown })?.code === 10) {
      return res.status(409).json({
        code: 'CONCURRENT_MODIFICATION',
        message: 'Hồ sơ đang được người khác cập nhật cùng lúc. Vui lòng tải lại và thử lại.',
        requestId,
      });
    }
    this.logger.error(`[${requestId}] ${(exception as Error)?.message}`, (exception as Error)?.stack);
    return res.status(500).json({ code: 'INTERNAL', message: 'Lỗi hệ thống. Vui lòng thử lại.', requestId });
  }
}
