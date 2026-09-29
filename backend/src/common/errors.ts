import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Error as ApiError, ErrorDetails } from '../../../docs/contracts/frontend-types.js';
export type ErrorCode = ApiError['error']['code'];
export class DomainError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string = code, readonly details: ErrorDetails = {}) { super(message); }
}
export function fail(status: number, code: ErrorCode, details: ErrorDetails = {}): never { throw new DomainError(status, code, code, details); }
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<{ requestId?: string }>();
    let e = error instanceof DomainError ? error : new DomainError(500, 'INTERNAL_ERROR');
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const codes: Record<number, ErrorCode> = {400:'VALIDATION_ERROR',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',413:'FILE_TOO_LARGE',415:'UNSUPPORTED_MEDIA_TYPE',429:'RATE_LIMITED',500:'INTERNAL_ERROR',503:'DEPENDENCY_UNAVAILABLE'};
      e = new DomainError(status, codes[status] ?? 'INTERNAL_ERROR');
    }
    if(e.status===429 && !http.getResponse().getHeader?.('Retry-After')) http.getResponse().setHeader('Retry-After','60');
    http.getResponse().status(e.status).json({ error: { code: e.code, message: e.message, details: e.details }, requestId: request.requestId ?? randomUUID() });
  }
}
