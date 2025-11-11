import {HttpStatus} from './status';
import type {ClientErrorStatusCode, ServerErrorStatusCode} from './status';

/** The type for the body message of HTTP errors. */
type Message = string | string[];

/** The structure of the HTTP error body. */
type ErrorBody = {
  data?: Record<string, any> | null;
  code?: string | null;
  error: string;
  status: Status;
  message: Message;
};

// Define the type for the status code of HTTP errors
type Status = ServerErrorStatusCode | ClientErrorStatusCode;

/**
 * Get a human-readable error name from the HTTP status code.
 */
const getErrorName = (status: Status): string => {
  if (status < 400 || status > 511) return 'HttpError';
  const statusKey = HttpStatus[`${status}_NAME`];
  if (!statusKey) return 'HttpError';
  const name = statusKey
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\s+/g, '');
  return name.endsWith('Error') ? name : `${name}Error`;
};

/**
 * Base class for handling HTTP errors.
 */
export class HttpError extends Error {
  /**
   * Creates an instance of `HttpError`.
   */
  constructor(
    readonly status: Status = HttpStatus.INTERNAL_SERVER_ERROR,
    readonly options: Pick<ErrorBody, 'message' | 'data' | 'code'> & {
      /** Optional custom name override for the error */
      name?: string;
      cause?: unknown;
    } = {message: 'HttpError'},
  ) {
    super(
      typeof options.message === 'string'
        ? options.message
        : getErrorName(status),
    );
    // Allow developer to override error name
    this.name = options.name ?? getErrorName(status);

    // Preserve stack trace
    Error.captureStackTrace?.(this, this.constructor);
  }

  static isHttpError(value: unknown): value is HttpError {
    return value instanceof HttpError;
  }

  getBody(): ErrorBody {
    const {name: error, status} = this;
    const {message, data = null, code = null} = this.options;
    return {status, error, message, data, code};
  }
}

/**
 * Utility to create custom HttpError subclasses with optional custom naming.
 */
export const createHttpError = (status: Status, defaultName?: string) =>
  class extends HttpError {
    constructor(
      message: Message,
      options: {
        cause?: unknown;
        code?: string | null;
        data?: Record<string, unknown> | null;
        name?: string;
      } = {},
    ) {
      super(status, {message, ...options, name: options.name ?? defaultName});
    }
  };
