import {HttpError} from '@/errors';
import {HttpStatus} from '@/status';
import type {ErrorHandler} from '@/types';

type Options = {
  isDev?: boolean;
  logger?: (error: unknown) => void;
};

export const errorHandler =
  ({isDev = true, logger = console.error}: Options): ErrorHandler =>
  (err, ctx) => {
    // Handle known HttpError instances
    if (HttpError.isError(err)) {
      // Log the cause if it exists
      if (err.options.cause) logger?.(err.options.cause);
      return ctx.status(err.status).json(err.getBody());
    }
    // Write unknown errors if a write function is provided
    logger?.(err);
    // Standardized error response for unknown exceptions
    const unknown = {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: isDev
        ? err.message || 'Unexpected error'
        : 'Something went wrong',
      stack: isDev ? err.stack : undefined,
    };
    ctx.status(unknown.status).json(unknown);
  };
