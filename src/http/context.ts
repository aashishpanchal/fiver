import {kCtxRes} from '@/consts';
import {Request} from './request';
import type {BaseMime, ResponseHeader} from '@/types';
import type {HttpRequest, HttpResponse, RecognizedString} from '../../uws';
import {
  HttpStatus,
  type HttpStatusCode,
  type RedirectStatusCode,
} from '@/status';

interface SetHeaders {
  (name: 'content-type', value?: BaseMime, append?: boolean): void;
  (name: ResponseHeader, value?: string, append?: boolean): void;
  (name: string, value?: string, append?: boolean): void;
}

type ResData = {
  vars?: Map<string, unknown>;
  headers: Record<string, string | string[]>;
  statusCode?: HttpStatusCode;
  headerSent: boolean;
  aborts: Array<() => void>;
};

type Options = {
  req: HttpRequest;
  res: HttpResponse;
  isSSL: boolean;
  appName: string;
  bodyLimit?: number;
  methods?: string[];
};

/**
 * ⚡ Unified high-performance Context for uWebSockets.js
 *
 * Combines both Request + Response APIs into one streamlined object.
 * Inspired by Fiber GO, Hono, and Oak — but built for uWS zero-copy speed.
 *
 * @example
 * ```ts
 * app.get('/users/:id', async (ctx) => {
 *   const id = ctx.param('id');
 *   const data = await ctx.jsonParse();
 *   ctx.status(200).json({ id, data });
 * });
 * ```
 */
export class Context extends Request {
  /** Whether the request was aborted by the client */
  aborted = false;

  /** Whether response has already been sent */
  finished = false;

  // Symbol-based private internal data
  readonly [kCtxRes]: ResData = {
    aborts: [],
    headers: Object.create(null),
    headerSent: false,
  };

  constructor({req, res, appName, isSSL, bodyLimit, methods}: Options) {
    super({req, res, bodyLimit, isSSL, methods});
    // Default response headers
    this.res.writeHeader('x-powered-by', appName);
    this.res.writeHeader('keep-alive', 'timeout=10');
    // Abort Handling
    res.onAborted(() => {
      if (this.aborted || this.finished) return;
      this.aborted = true;
      this.finished = true;
      // Request data aborted
      this.destroy();
      this[kCtxRes].aborts.forEach(cb => cb());
      this[kCtxRes].aborts = [];
    });
  }

  /**
   * Register callback for when client disconnects
   *
   * @example
   * ```ts
   * ctx.onAbort(() => db.release());
   * ```
   */
  onAbort(fn: () => void): void {
    this[kCtxRes].aborts.push(fn);
  }

  /**
   * Store transient data between middlewares
   *
   * @example
   * ```ts
   * ctx.set('user', { id: 1 });
   * ```
   */
  set<T>(key: string, value: T): this {
    this[kCtxRes].vars ??= new Map();
    this[kCtxRes].vars.set(key, value);
    return this;
  }

  /**
   * Retrieve stored middleware data
   *
   * @example
   * ```ts
   * const user = ctx.get<{ id: number }>('user');
   * ```
   */
  get<T>(key: string): T | undefined {
    return this[kCtxRes].vars?.get(key) as T | undefined;
  }

  /**
   * Set HTTP status code
   * Chainable, so you can call: ctx.status(201).json({...})
   *
   * @example
   * ```ts
   * ctx.status(201).json({ created: true });
   * ctx.status(404).text('Not Found');
   * ```
   */
  status = (code: HttpStatusCode): this => {
    this[kCtxRes].statusCode = code;
    return this;
  };

  /**
   * setter response headers with type safety
   *
   * @example
   * ```ts
   * ctx.setHeader('Content-Type', 'application/json');
   * ctx.setHeader('x-custom', 'value', true); // append
   * ```
   */
  setHeader: SetHeaders = (field, value, append): void => {
    const r = this[kCtxRes];
    if (r.headerSent)
      throw new Error('Cannot set headers after they are sent to the client');
    // DELETE
    if (value === undefined) {
      delete r.headers[field];
      return;
    }
    // APPEND
    if (append) {
      const existing = r.headers[field];
      if (existing === undefined) {
        r.headers[field] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        r.headers[field] = [existing, value];
      }
      return;
    }
    // SET (replace)
    r.headers[field] = value;
  };

  writeHeaders() {
    const r = this[kCtxRes];
    for (const header in r.headers) {
      const value = r.headers[header];
      if (Array.isArray(value)) {
        for (const val of value) {
          this.res.writeHeader(header, val);
        }
      } else {
        this.res.writeHeader(header, value);
      }
    }
    r.headerSent = true;
  }

  writeStatus() {
    const r = this[kCtxRes];
    const statusCode = r.statusCode || 200;
    const statusMessage = HttpStatus[`${statusCode}_NAME`] ?? '';
    this.res.writeStatus(`${r.statusCode} ${statusMessage}`);
  }

  /**
   * End response with optional body
   *
   * @example
   * ```ts
   * ctx.end('Hello World');
   * ```
   */
  end(body?: RecognizedString, cb?: () => void): void {
    if (this.finished || this.aborted) return;
    this.res.cork(() => {
      // Write Header
      this.writeHeaders();
      // Write Status
      this.writeStatus();
      // Method are Head
      if (this.method === 'HEAD') {
        const len =
          body && typeof body === 'string' ? Buffer.byteLength(body) : 0;
        this.res.endWithoutBody(len);
        return;
      }
      if (body === undefined) {
        this.res.end();
        return;
      }
      if (Buffer.isBuffer(body)) {
        const arrBuf = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer;
        this.res.end(arrBuf);
        return;
      }
      queueMicrotask(() => {
        this.finished = true;
        cb?.();
      });
      this.res.end(body);
    });
  }

  /**
   * Send plain text response
   * Automatically sets Content-Type to text/plain with UTF-8
   *
   * @example
   * ```ts
   * ctx.text('Hello World');
   * ctx.status(200).text('Success');
   * ```
   */
  text(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    if (!r.headers['content-type']) {
      r.headers['content-type'] = 'text/plain; charset=utf-8';
    }
    this.end(body);
  }

  /**
   * Send JSON response
   * Automatically stringifies and sets Content-Type
   *
   * @example
   * ```ts
   * ctx.json({ users: [...] });
   * ctx.json({ error: 'Not Found' }, 404);
   * ```
   */
  json(body: any, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    if (!r.headers['content-type']) {
      r.headers['content-type'] = 'application/json; charset=utf-8';
    }
    this.end(JSON.stringify(body));
  }

  /**
   * Send HTML response
   * Automatically sets Content-Type to text/html
   *
   * @example
   * ```ts
   * ctx.html('<h1>Welcome</h1>');
   * ctx.html('<p>Error</p>', 500);
   * ```
   */
  html(body: string, status?: HttpStatusCode): void {
    const r = this[kCtxRes];
    if (status !== undefined) r.statusCode = status;
    if (!r.headers['content-type']) {
      r.headers['content-type'] = 'text/html; charset=utf-8';
    }
    this.end(body);
  }

  /**
   * Redirect to another URL
   * Sends Location header with empty body (browser handles the redirect)
   *
   * @example
   * ```ts
   * ctx.redirect('/login');
   * ctx.redirect('/home', 301); // Permanent redirect
   * ctx.redirect('https://example.com');
   * ```
   */
  redirect(url: string, status: RedirectStatusCode = 302): void {
    const r = this[kCtxRes];
    r.statusCode = status as any;
    r.headers['location'] = url;
    this.end();
  }
}
