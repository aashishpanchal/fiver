import {MAX_BYTES} from '../consts';
import querystring from 'querystring';
import {UwsReadable} from './readable';
import {UwsWritable} from './writable';
import type {HttpRequest, HttpResponse} from '../../uws';
import type {HttpStatusCode, RedirectStatusCode} from '../status';
import type {
  BaseMime,
  BufferArray,
  CustomHeader,
  Handler,
  RequestHeader,
  ResponseHeader,
  Result,
  RouterRoute,
} from '../types';
import {safeReadBody} from '../utils/tools';
import {FormData, type FormOption, formParse} from '../utils/body';

// -------------------------------
// 🔸 Internal Symbol Keys
// -------------------------------
export const kResData = Symbol('Context-Res');
export const kReqData = Symbol('Context-Req');
export const kMatch = Symbol('Request-Match');

interface SetHeaders {
  (name: 'content-type', value?: BaseMime, append?: boolean): void;
  (name: ResponseHeader, value?: string, append?: boolean): void;
  (name: string, value?: string, append?: boolean): void;
}

type ResData = {
  vars?: Map<string, unknown>;
  status?: HttpStatusCode;
  headers: Map<string, string | string[]>;
  headerSent: boolean;
  aborts: (() => void)[];
};

type ReqData = {
  body: Partial<{
    json: any;
    text: string;
    blob: Blob;
    arrayBuffer: ArrayBuffer;
    formData: FormData;
  }>;
  headers: Map<string, string | string[]>;
  urlQuery?: string;
  param?: Map<string, string>;
};

type Options = {
  req: HttpRequest;
  res: HttpResponse;
  appName?: string;
  maxBytes?: number;
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
 *   const data = await ctx.parseJson();
 *   ctx.status(200).json({ id, data });
 * });
 * ```
 */
export class UwsCtx {
  readonly req: HttpRequest;
  readonly res: HttpResponse;

  /** Request URL path + query (e.g. `/users?id=1`) */
  readonly url: string;

  /** HTTP method in uppercase (e.g. `POST`, `GET`) */
  readonly method: string;

  /** Route index (internal use for router stack) */
  index = 0;

  /** Whether the request was aborted by the client */
  aborted = false;

  /** Whether response has already been sent */
  finished = false;

  /** Whether the body should be read (depends on method) */
  isRead = false;

  // Symbol-based private internal data
  readonly [kReqData]: ReqData = {
    body: {},
    urlQuery: undefined,
    headers: new Map(),
    param: new Map(),
  };
  readonly [kResData]: ResData = {
    aborts: [],
    headers: new Map(),
    headerSent: false,
  };
  private [kMatch]!: Result<[Handler, RouterRoute]>;

  // Streams
  #reqStream?: UwsReadable;
  // #resStream?: UwsWritable;

  constructor({req, res, maxBytes, methods, appName}: Options) {
    this.req = req;
    this.res = res;
    this.url = req.getUrl();
    this.method = req.getMethod().toUpperCase();
    // Cache query string
    const q = req.getQuery();
    this[kReqData].urlQuery = q ? '?' + q : undefined;
    // Default response headers
    this[kResData].headers
      .set('x-powered-by', appName || 'Fiber-js')
      .set('cache-control', 'no-store');
    // Cache request headers at construction (safe before async)
    req.forEach((key, value) => {
      const lower = key.toLowerCase();
      const existing = this[kReqData].headers.get(lower);
      if (existing) {
        if (Array.isArray(existing)) existing.push(value);
        else this[kReqData].headers.set(lower, [existing, value]);
      } else {
        this[kReqData].headers.set(lower, value);
      }
    });
    // Abort Handling
    res.onAborted(() => {
      if (this.aborted || this.finished) return;
      this.aborted = true;
      this.finished = true;
      this[kResData].aborts.forEach(cb => cb());
      this[kResData].aborts = [];
    });
    // Determine if this request method can have a body
    this.isRead =
      ['POST', 'PUT', 'PATCH'].includes(this.method) ||
      ((methods && methods.includes(this.method)) as boolean);
    // Lazily create readable stream if needed
    if (this.isRead) {
      this.#reqStream = new UwsReadable({
        res,
        maxBytes: maxBytes || MAX_BYTES,
      });
      this.onAbort(() => {
        this[kReqData].body = {};
        this.#reqStream?.destroy(
          new Error('Request cancelled during body read'),
        );
      });
    }
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
    this[kResData].aborts.push(fn);
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
    this[kResData].vars ??= new Map();
    this[kResData].vars.set(key, value);
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
    return this[kResData].vars?.get(key) as T | undefined;
  }

  /**
   * Returns parsed route parameters.
   *
   * @example
   * ```ts
   * ctx.param('id'); // "123"
   * ctx.param();     // { id: "123", name: "John" }
   * ```
   */
  param(): Record<string, string>;
  param(field?: string): string | undefined;
  param(field?: string): any {
    const routeIndex = this.index || 0;
    const routeParams = this[kMatch][0][routeIndex][1];
    const cache = this[kReqData].param!;
    // Helper: get raw param value from match result
    const getParamValue = (paramKey: any): string | undefined =>
      this[kMatch][1] ? this[kMatch][1][paramKey] : paramKey;
    // Helper: decode URL-encoded values (cached)
    const decode = (value: string): string => {
      if (cache.has(value)) return cache.get(value)!;
      const decoded = value.includes('%') ? decodeURIComponent(value) : value;
      cache.set(value, decoded);
      return decoded;
    };
    // No argument → return all params
    if (field === undefined) {
      const result: Record<string, string> = {};
      for (const key of Object.keys(routeParams)) {
        const value = getParamValue(routeParams[key]);
        if (value !== undefined) result[key] = decode(value);
      }
      return result;
    }
    // Argument provided → return one param
    const paramKey = routeParams[field];
    const value = getParamValue(paramKey);
    return value ? decode(value) : value;
  }

  /**
   * Returns parsed query parameters.
   *
   * @example
   * ```ts
   * ctx.query('page'); // => "2"
   * ctx.query();       // => { page: "2", active: "true" }
   * ```
   */
  query(): Record<string, string>;
  query(field?: string): string | undefined;
  query(field?: string): any {
    throw new Error('Query not implement!');
  }

  /**
   * Returns a readable stream of the request body.
   *
   * @example
   * ```ts
   * const file = fs.createWriteStream('upload.bin');
   * ctx.reqStream.pipe(file);
   * ```
   */
  get reqStream(): UwsReadable {
    if (this.#reqStream) return this.#reqStream;
    throw new Error(
      `Cannot access request body stream for HTTP method '${this.method}'.`,
    );
  }

  get resStream(): UwsWritable {
    throw new Error('Not Implement');
  }
  /**
   * Returns a specific request header,
   * or all headers if no name is provided.
   *
   * @example
   * ```ts
   * req.header('content-type'); // => "application/json"
   * req.header(); // => { host: "localhost:3000", ... }
   * ```
   */
  reqHeader(field: RequestHeader): string | undefined;
  reqHeader(field: string): string | undefined;
  reqHeader(): Record<RequestHeader | (string & CustomHeader), string>;
  reqHeader(field?: string): any {
    if (!field) return Object.fromEntries(this[kReqData].headers);
    return this[kReqData].headers.get(field.toLowerCase());
  }

  /**
   * Set/get response headers with type safety
   *
   * @example
   * ```ts
   * ctx.header('Content-Type', 'application/json');
   * ctx.header('x-custom', 'value', true); // append
   * ```
   */
  resHeader: SetHeaders = (name, value, append): void => {
    const internal = this[kResData];
    if (internal.headerSent) throw new Error('Headers already sent');
    const key = name.toLowerCase();
    if (value === undefined) {
      internal.headers.delete(key);
      return;
    }
    if (append) {
      const existing = internal.headers.get(key);
      if (existing) {
        internal.headers.set(
          key,
          Array.isArray(existing)
            ? (existing.push(value), existing)
            : [existing, value],
        );
      } else {
        internal.headers.set(key, value);
      }
    } else {
      internal.headers.set(key, value);
    }
  };

  /**
   * Reads and returns the full request body as a raw Buffer.
   *
   * @example
   * ```ts
   * const buffer = await req.body();
   * console.log(buffer.length, 'bytes received');
   * ```
   */
  async bodyRaw(): Promise<BufferArray> {
    safeReadBody('Body', this.method, this.isRead, this.aborted);
    // UwsReadable handles it via #buffer
    return new Promise<BufferArray>((resolve, reject) => {
      this.#reqStream?.once('complete', resolve);
      this.#reqStream?.once('error', reject);
    });
  }

  /**
   * Reads and returns the request body as a UTF-8 string.
   *
   * @example
   * ```ts
   * const text = await req.text();
   * console.log('Body:', text);
   * ```
   */
  async textParse(): Promise<string> {
    safeReadBody('Text', this.method, this.isRead, this.aborted);
    if (this[kReqData].body.text) return this[kReqData].body.text;
    const buf = await this.bodyRaw();
    const text = buf.toString('utf-8');
    this[kReqData].body.text = text.trim();
    return text;
  }

  /**
   * Reads and returns the request body as an ArrayBuffer.
   *
   * @example
   * ```ts
   * const arrayBuffer = await req.arrayBuffer();
   * console.log(arrayBuffer.byteLength);
   * ```
   * @returns {Promise<ArrayBuffer>}
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    safeReadBody('ArrayBuffer', this.method, this.isRead, this.aborted);
    if (this[kReqData].body.arrayBuffer) return this[kReqData].body.arrayBuffer;
    const buffer = await this.bodyRaw();
    // Convert Node Buffer → ArrayBuffer safely
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    this[kReqData].body.arrayBuffer = arrayBuffer;
    return arrayBuffer;
  }

  /**
   * Reads the body as a Blob (Node 18+).
   *
   * @example
   * ```ts
   * const blob = await req.blob();
   * console.log('Blob size:', blob.size);
   * ```
   *
   * @returns {Promise<Blob>}
   */
  async parseBlob(): Promise<Blob> {
    safeReadBody('Blob', this.method, this.isRead, this.aborted);
    if (this[kReqData].body.blob) return this[kReqData].body.blob;
    const type = this.reqHeader('Content-Type') || 'application/octet-stream';
    const arrayBuffer = await this.arrayBuffer();
    const blob = new Blob([arrayBuffer], {type});
    this[kReqData].body.blob = blob;
    return blob;
  }

  /**
   * Parses and returns the request body as JSON.
   *
   * @example
   * ```ts
   * const data = await req.json();
   * console.log(data.user, data.email);
   * ```
   *
   * @template T
   * @returns {Promise<T>} The parsed JSON body.
   * @throws {SyntaxError} If body is empty or malformed.
   */
  async parseJson<T = any>(): Promise<T> {
    safeReadBody('JSON', this.method, this.isRead, this.aborted);
    if (this[kReqData].body.json) return this[kReqData].body.json;
    const text = await this.textParse();
    if (!text) throw new SyntaxError('Empty request body, expected JSON');
    try {
      const json = JSON.parse(text);
      this[kReqData].body.json = json;
      return json;
    } catch {
      throw new SyntaxError('Malformed JSON in request body');
    }
  }

  /**
   * Parses form submissions (URL-encoded or multipart/form-data).
   *
   * @example
   * ```ts
   * const form = await req.formData();
   * console.log(form.get('username')); // => "alice"
   * ```
   * @param {FormOption} [options] - Optional multipart parser settings.
   * @returns {Promise<FormData>}
   * @throws {TypeError} If content type is unsupported.
   */
  async parseForm(options?: FormOption): Promise<FormData> {
    safeReadBody('FormData', this.method, this.isRead, this.aborted);
    if (this[kReqData].body.formData) return this[kReqData].body.formData;
    const cType = this.reqHeader('Content-Type')?.toLowerCase() ?? '';
    // Url Encode Form Data
    if (cType.startsWith('application/x-www-form-urlencoded')) {
      const form = new FormData();
      const text = await this.textParse();
      if (!text) throw new SyntaxError('Empty form data');
      try {
        const parsed = querystring.parse(text);
        for (const [k, v] of Object.entries(parsed)) form.append(k, v);
        this[kReqData].body.formData = form;
        return form;
      } catch (error) {
        throw new SyntaxError('Malformed URL-encoded data');
      }
    } else if (cType.startsWith('multipart/form-data')) {
      // Get buffer from stream (cached in UwsReadable)
      const buf = await this.bodyRaw();
      const form = formParse(buf, cType, options);
      this[kReqData].body.formData = form;
      return form;
    }
    throw new TypeError(
      `Content-Type '${cType}' not supported for form parsing`,
    );
  }

  /**
   * Internal: Write status, headers, and body in single operation
   * Uses cork to batch all writes into one TCP packet for performance
   */
  #end(body?: string | Buffer, type?: string): void {
    if (this.finished || this.aborted) return;
    this.finished = true; // <-- set immediately
    const internal = this[kResData];
    const res = this.res;
    if (type && !internal.headers.has('content-type')) {
      internal.headers.set('content-type', type);
    }
    const statusCode = internal.status || 200;
    res.cork(() => {
      res.writeStatus(String(statusCode));
      for (const [key, val] of internal.headers) {
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) res.writeHeader(key, val[i]);
        } else {
          res.writeHeader(key, val);
        }
      }
      internal.headerSent = true;
      // 🔸 HEAD request → send headers only
      const method = this.method;
      if (method === 'HEAD') {
        const len =
          body && typeof body === 'string' ? Buffer.byteLength(body) : 0;
        res.endWithoutBody(len);
        return;
      }
      // Normal body send
      if (body === undefined) return res.end();
      if (Buffer.isBuffer(body)) {
        const arrBuf = body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        );
        return res.end(arrBuf as any);
      }
      res.end(body);
    });
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
    this[kResData].status = code;
    return this;
  };

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
  text = (body: string, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[kResData].status = status;
    }
    this.#end(body, 'text/plain;charset=utf-8');
  };

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
  json = (body: any, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[kResData].status = status;
    }
    this.#end(JSON.stringify(body), 'application/json;charset=utf-8');
  };

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
  html = (body: string, status?: HttpStatusCode): void => {
    if (status !== undefined) {
      this[kResData].status = status;
    }
    this.#end(body, 'text/html;charset=utf-8');
  };

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
  redirect = (url: string, status: RedirectStatusCode = 302): void => {
    this[kResData].status = status as any;
    this.resHeader('Location', url);
    this.#end();
  };
}
