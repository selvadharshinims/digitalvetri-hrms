import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';

/**
 * Wraps successful JSON responses in the standard `{ data, meta }` envelope.
 *
 * Skipped when:
 *   - The controller has already set a non-JSON `Content-Type` (e.g. text/csv)
 *   - The handler returns a Buffer, ReadableStream, or a payload that already
 *     contains a top-level `data` key (so controllers can shape their own
 *     envelope when they need pagination meta)
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        const response = context.switchToHttp().getResponse<Response>();
        const contentType = response.getHeader('Content-Type');
        if (
          typeof contentType === 'string' &&
          !contentType.includes('application/json')
        ) {
          return payload;
        }
        if (Buffer.isBuffer(payload)) return payload;
        if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
          return payload;
        }
        return { data: payload, meta: { timestamp: new Date().toISOString() } };
      }),
    );
  }
}
