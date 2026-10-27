import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const STATUS_TEXT: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

function statusText(status: number): string {
  return STATUS_TEXT[status] ?? 'Error';
}

function normaliseMessage(value: unknown): string[] | null {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item),
    );
  }
  return null;
}

/**
 * One filter produces every error body, matching contract section 2.5:
 * `{ statusCode, error, message: string[], path, timestamp }`. It knows nothing about
 * PostgreSQL: a constraint that means a 409 is caught where it is raised and rethrown as a
 * `ConflictException`, so anything else that is not an `HttpException` is a 500.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string[] = ['Internal server error'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = [body];
        error = statusText(status);
      } else if (typeof body === 'object' && body !== null) {
        const record = body as { message?: unknown; error?: unknown };
        message = normaliseMessage(record.message) ?? [exception.message];
        error =
          typeof record.error === 'string' ? record.error : statusText(status);
      } else {
        message = [exception.message];
        error = statusText(status);
      }
    } else {
      this.logger.error(
        `Unhandled error on ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
