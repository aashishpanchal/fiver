import {UwsRequest} from './request';
import {HttpRequest, HttpResponse} from '../../uws';
import type {HttpStatusCode, RedirectStatusCode} from '../status';
import {Handler, ResponseHeader, Result, RouterRoute, BaseMime} from '../types';

export const cInternal = Symbol('Context-Internal');

interface SetHeaders {
  (name: 'content-type', value?: BaseMime, append?: boolean): void;
  (name: ResponseHeader, value?: string, append?: boolean): void;
  (name: string, value?: string, append?: boolean): void;
}

type InternalData = {
  vars: Map<string, unknown>;
  status?: HttpStatusCode;
  headers: Map<string, string | string[]>;
  headerSent: boolean;
  ended: boolean;
  aborts: (() => void)[];
};

type Options = {
  req: HttpRequest;
  res: HttpResponse;
  methods?: string[];
  maxBytes?: number;
  matchResult: Result<[Handler, RouterRoute]>;
};

/**
 * High-performance request/response context for uWebSockets.js
 * Provides Express-like API with zero-copy performance
 */
export class UwsContext {
  req: UwsRequest;
  res: HttpResponse;
  aborted = false;
  routeIndex = 0;
  [cInternal]: InternalData = {
    vars: new Map(),
    ended: false,
    headers: new Map(),
    headerSent: false,
    aborts: [],
  };

  constructor({req, res, maxBytes, methods, matchResult}: Options) {
    this.res = res;
    // Set default headers
    this[cInternal].headers.set('x-powered-by', 'fiver');
    this[cInternal].headers.set('cache-control', 'no-store');
    // Handle client disconnect
    res.onAborted(() => {
      this.aborted = true;
      const aborts = this[cInternal].aborts;
      // Trigger all registered abort handlers
      aborts.forEach(cb => cb());
      this[cInternal].aborts = [];
    });
    // Detect custom request
    this.req = new UwsRequest({
      ctx: this,
      req,
      maxBytes,
      methods,
      matchResult,
    });
  }

  /**
   * Register callback for when client disconnects
   * Useful for cleanup operations like closing database connections
   *
   * @param fn - Function to call on abort
   *
   * @example
   * ```ts
   * ctx.onAbort(() => {
   *   console.log('Client disconnected');
   *   db.release();
   * });
   * ```
   */
  onAbort = (fn: () => void): void => {
    this[cInternal].aborts.push(fn);
  };

  /**
   * Store data in context for middleware communication
   * Data persists for the lifetime of this request only
   *
   * @param key - Unique identifier for the value
   * @param value - Any data to store
   * @returns this for chaining
   *
   * @example
   * ```ts
   * ctx.set('user', { id: 123, name: 'John' });
   * ```
   */
  set = <T>(key: string, value: T): this => {
    this[cInternal].vars.set(key, value);
    return this;
  };

  /**
   * Retrieve data stored in context
   *
   * @param key - Identifier used when storing
   * @returns The stored value or undefined
   *
   * @example
   * ```ts
   * const user = ctx.get<User>('user');
   * if (user) console.log(user.name);
   * ```
   */
  get = <T>(key: string): T | undefined => {
    return this[cInternal].vars.get(key) as T | undefined;
  };

  /**
   * Set/get response headers with type safety
   *
   * @example
   * ```ts
   * ctx.header('Content-Type', 'application/json');
   * ctx.header('x-custom', 'value', true); // append
   * ```
   */
  header: SetHeaders = (name, value, append): void => {
    const internal = this[cInternal];
    const key = name.toLowerCase();
    if (value === undefined) {
      internal.headers.delete(key);
      return;
    }
    if (internal.headerSent)
      throw new Error('Cannot set headers after they are sent to the client');
    // Auto-append charset for text content types
    if (key === 'content-type' && typeof value === 'string') {
      if (
        !value.includes('charset=') &&
        (value.startsWith('text/') ||
          value === 'application/json' ||
          value === 'application/javascript')
      ) {
        value += '; charset=utf-8';
      }
    }
    if (append) {
      const existing = internal.headers.get(key);
      if (existing) {
        const newValue = Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
        internal.headers.set(key, newValue);
      } else {
        internal.headers.set(key, value);
      }
    } else {
      internal.headers.set(key, value);
    }
  };

  /**
   * Internal: Write status, headers, and body in single operation
   * Uses cork to batch all writes into one TCP packet for performance
   */
  #end(body?: string | Buffer<ArrayBuffer>, type?: string): void {
    const internal = this[cInternal];
    if (internal.ended || this.aborted) return;

    // Set content-type if provided and not already set
    if (type && !internal.headers.has('content-type')) {
      internal.headers.set('content-type', type);
    }

    const statusCode = internal.status || 200;

    // Cork batches all writes into single TCP send for better performance
    this.res.cork(() => {
      this.res.writeStatus(`${statusCode}`);
      // Write all headers (handles both single and array values)
      internal.headers.forEach((value, key) => {
        if (Array.isArray(value)) {
          for (const val of value) {
            this.res.writeHeader(key, String(val));
          }
        } else {
          this.res.writeHeader(key, String(value));
        }
      });
      internal.headerSent = true;

      if (body !== undefined) {
        if (Buffer.isBuffer(body)) {
          // uWS requires ArrayBuffer, not Node Buffer
          const arrayBuffer = body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.byteLength,
          );
          this.res.end(arrayBuffer);
        } else {
          this.res.end(body);
        }
      } else {
        this.res.end();
      }
    });

    internal.ended = true;
  }

  /**
   * Set HTTP status code
   * Chainable, so you can call: ctx.status(201).json({...})
   *
   * @param code - HTTP status code (200, 404, 500, etc.)
   * @returns this for chaining
   *
   * @example
   * ```ts
   * ctx.status(201).json({ created: true });
   * ctx.status(404).text('Not Found');
   * ```
   */
  status = (code: HttpStatusCode): this => {
    this[cInternal].status = code;
    return this;
  };

  /**
   * Send plain text response
   * Automatically sets Content-Type to text/plain with UTF-8
   *
   * @param body - Text to send
   *
   * @example
   * ```ts
   * ctx.text('Hello World');
   * ctx.status(200).text('Success');
   * ```
   */
  text = (body: string, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[cInternal].status = status;
    }
    this.#end(body, 'text/plain; charset=utf-8');
  };

  /**
   * Send JSON response
   * Automatically stringifies and sets Content-Type
   *
   * @param body - Any JSON-serializable value
   * @param status - Optional status code (overrides ctx.status())
   *
   * @example
   * ```ts
   * ctx.json({ users: [...] });
   * ctx.json({ error: 'Not Found' }, 404);
   * ```
   */
  json = (body: any, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[cInternal].status = status;
    }
    this.#end(JSON.stringify(body), 'application/json; charset=utf-8');
  };

  /**
   * Send HTML response
   * Automatically sets Content-Type to text/html
   *
   * @param body - HTML string
   * @param status - Optional status code
   *
   * @example
   * ```ts
   * ctx.html('<h1>Welcome</h1>');
   * ctx.html('<p>Error</p>', 500);
   * ```
   */
  html = (body: string, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[cInternal].status = status;
    }
    this.#end(body, 'text/html; charset=utf-8');
  };

  /**
   * Redirect to another URL
   * Sends Location header with empty body (browser handles the redirect)
   *
   * @param url - Target URL (can be relative or absolute)
   * @param status - HTTP redirect status (default: 302 Found)
   *                 Common: 301 (Permanent), 302 (Temporary), 303 (See Other)
   *
   * @example
   * ```ts
   * ctx.redirect('/login');
   * ctx.redirect('/home', 301); // Permanent redirect
   * ctx.redirect('https://example.com');
   * ```
   */
  redirect = (url: string, status: RedirectStatusCode = 302): void => {
    this[cInternal].status = status as any;
    this.header('Location', url);
    this.#end();
  };
}
