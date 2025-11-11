import {Blob} from 'buffer';
import {MAX_BYTES} from '../consts';
import {HttpRequest} from '../../uws';
import querystring from 'querystring';
import {UwsReadable} from './readable';
import type {UwsContext} from './context';
import type {
  Result,
  Handler,
  RouterRoute,
  CustomHeader,
  RequestHeader,
} from '../types';
import {FormData, type FormOption, formParse} from '../utils/body';

export const rInternal = Symbol('Request-Internal');

type InternalData = {
  body: Partial<{
    json: any;
    text: string;
    blob: Blob;
    arrayBuffer: ArrayBuffer;
    formData: FormData;
  }>;
  headers: Map<string, string | string[]>;
  urlQuery: string | undefined;
  param?: Map<string, string>;
};
type BufferArray = Buffer<ArrayBuffer>;
type Options = {
  ctx: UwsContext;
  req: HttpRequest;
  methods?: string[];
  maxBytes?: number;
  matchResult: Result<[Handler, RouterRoute]>;
};

/**
 * High-level request wrapper for uWebSockets.js.
 *
 * Handles parsing of:
 *  - Headers
 *  - Prams regex
 *  - Query string
 *  - Body (Buffer, text, JSON, Blob, FormData)
 *
 * Provides safe body reading with abort detection and
 * per-request caching to avoid duplicate reads.
 */
export class UwsRequest {
  /** The underlying uWebSockets request object */
  raw: HttpRequest;
  /** Owning context instance */
  #ctx: UwsContext;
  /** Maximum allowed body size in bytes */
  maxBytes: number;
  /** Internal body reader stream */
  #stream?: UwsReadable;
  /** Whether this HTTP method supports reading a body */
  #shouldRead?: boolean;
  /** Cached internal data */
  [rInternal]: InternalData = {
    body: {},
    headers: new Map(),
    urlQuery: undefined,
    param: new Map(),
  };
  /** Request URL path + query (e.g. `/users?id=1`) */
  url: string;
  /** HTTP method in uppercase (e.g. `POST`, `GET`) */
  method: string;
  #matchResult: Result<[Handler, RouterRoute]>;

  constructor({ctx, req, maxBytes, methods, matchResult}: Options) {
    this.raw = req;
    this.#ctx = ctx;
    this.url = req.getUrl();
    this.method = req.getMethod().toUpperCase();
    this.#matchResult = matchResult;
    // Get query-url
    this[rInternal].urlQuery = req.getQuery() ?? '';
    if (this[rInternal].urlQuery) {
      this[rInternal].urlQuery = '?' + this[rInternal].urlQuery;
    }
    // Cache headers safely before any async operation
    const headers = this[rInternal].headers;
    req.forEach((lower, value) => {
      const existing = headers.get(lower);
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else if (lower === 'set-cookie') {
          headers.set(lower, [existing, value]);
        } else if (lower === 'cookie') {
          headers.set(lower, `${existing}; ${value}`);
        } else {
          headers.set(lower, `${existing}, ${value}`);
        }
      } else {
        if (lower === 'set-cookie') headers.set(lower, [value]);
        else headers.set(lower, value);
      }
    });
    // Default body size limit
    this.maxBytes = maxBytes || MAX_BYTES;
    // Detect if body reading is relevant for this method
    const method = this.method;
    this.#shouldRead =
      ['POST', 'PUT', 'PATCH'].includes(method) ||
      (methods && methods.includes(method));
    // Lazily created body stream (not read yet)
    if (this.#shouldRead) {
      this.#stream = new UwsReadable({
        res: ctx.res,
        maxBytes: maxBytes,
      });
      // Abort listener to reject pending reads
      ctx.onAbort(() => {
        this[rInternal].body = {};
        this.#stream?.destroy(new Error('Request cancelled during body read'));
      });
    }
  }

  /**
   * Retrieves a single decoded route parameter by key,
   * or all decoded route parameters if no key is provided.
   *
   * @example
   * param() // => { id: "123", name: "John" }
   * param("id") // => "123"
   */
  param(): Record<string, string>;
  param(field?: string): string | undefined;
  param(field?: string): any {
    const routeIndex = this.#ctx.routeIndex || 0;
    const routeParams = this.#matchResult[0][routeIndex][1];
    const cache = this[rInternal].param!;
    // Helper: get raw param value from match result
    const getParamValue = (paramKey: any): string | undefined =>
      this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
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
   * Returns parsed query parameters as an object.
   *
   * @example
   * ```ts
   * // For URL: /users?active=true&page=2
   * req.query; // => { active: "true", page: "2" }
   * ```
   */
  get query(): Record<string, string> {
    const [_, qs] = this.url.split('?', 2);
    return Object.fromEntries(new URLSearchParams(qs));
  }

  /**
   * Returns a readable stream of the request body.
   *
   * Useful for directly streaming uploads (e.g. saving to disk or piping to another stream)
   * without buffering the entire body in memory.
   *
   * @example
   * ```ts
   * import fs from 'fs';
   *
   * // Save uploaded data directly to a file
   * const file = fs.createWriteStream('dist/upload.bin');
   * req.stream.pipe(file);
   *
   * file.on('finish', () => console.log('✅ Upload complete'));
   * ```
   */
  get stream(): UwsReadable {
    if (this.#stream) return this.#stream;
    throw new Error(
      `Cannot access request body stream for HTTP method '${this.method}'.`,
    );
  }

  /**
   * Returns a specific request header,
   * or all headers if no name is provided.
   *
   * @example
   * ```ts
   * req.header('content-type'); // => "application/json"
   * req.header();               // => { host: "localhost:3000", ... }
   * ```
   */
  header(field: RequestHeader): string | undefined;
  header(field: string): string | undefined;
  header(): Record<RequestHeader | (string & CustomHeader), string>;
  header(field?: string): any {
    if (!field) {
      // Return all headers as plain object
      return Object.fromEntries(this[rInternal].headers);
    }
    return this[rInternal].headers.get(field.toLowerCase());
  }

  /** Ensure request was not aborted before reading body */
  #safeReadBody(action: string) {
    if (!this.#shouldRead)
      throw new Error(
        `Cannot read body for HTTP method '${this.method}'. ` +
          `To allow this, add the method to 'methods' when constructing Fiver.`,
      );
    if (this.#ctx.aborted)
      throw new Error(
        `Cannot read ${action}: request was aborted by the client`,
      );
  }

  /**
   * Reads and returns the full request body as a raw Buffer.
   *
   * Useful for handling binary uploads or manual parsing.
   *
   * @example
   * ```ts
   * const buffer = await req.body();
   * console.log(buffer.length, 'bytes received');
   * ```
   */
  async body(): Promise<BufferArray> {
    this.#safeReadBody('body');
    // UwsReadable handles it via #buffer
    return new Promise<BufferArray>((resolve, reject) => {
      this.#stream?.once('complete', resolve);
      this.#stream?.once('error', reject);
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
  async text(): Promise<string> {
    this.#safeReadBody('text');
    if (this[rInternal].body.text) return this[rInternal].body.text;
    const buf = await this.body();
    const text = buf.toString('utf-8');
    this[rInternal].body.text = text.trim();
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
    this.#safeReadBody('arrayBuffer');
    if (this[rInternal].body.arrayBuffer)
      return this[rInternal].body.arrayBuffer;
    const buffer = await this.body();
    // Convert Node Buffer → ArrayBuffer safely
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    this[rInternal].body.arrayBuffer = arrayBuffer;
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
  async blob(): Promise<Blob> {
    this.#safeReadBody('blob');
    if (this[rInternal].body.blob) return this[rInternal].body.blob;
    const type = this.header('Content-Type') || 'application/octet-stream';
    const arrayBuffer = await this.arrayBuffer();
    const blob = new Blob([arrayBuffer], {type});
    this[rInternal].body.blob = blob;
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
  async json<T = any>(): Promise<T> {
    this.#safeReadBody('json');
    if (this[rInternal].body.json) return this[rInternal].body.json;
    const text = await this.text();
    if (!text) throw new SyntaxError('Empty request body, expected JSON');
    try {
      const json = JSON.parse(text);
      this[rInternal].body.json = json;
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
  async formData(options?: FormOption): Promise<FormData> {
    this.#safeReadBody('formData');
    if (this[rInternal].body.formData) return this[rInternal].body.formData;
    const cType = this.header('Content-Type')?.toLowerCase() ?? '';
    // Url Encode Form Data
    if (cType.startsWith('application/x-www-form-urlencoded')) {
      const form = new FormData();
      const text = await this.text();
      if (!text) throw new SyntaxError('Empty form data');
      try {
        const parsed = querystring.parse(text);
        for (const [k, v] of Object.entries(parsed)) form.append(k, v);
        this[rInternal].body.formData = form;
        return form;
      } catch (error) {
        throw new SyntaxError('Malformed URL-encoded data');
      }
    } else if (cType.startsWith('multipart/form-data')) {
      // Get buffer from stream (cached in UwsReadable)
      const buffer = await this.body();
      const form = formParse(buffer!, cType, options);
      this[rInternal].body.formData = form;
      return form;
    }
    throw new TypeError(
      `Content-Type '${cType}' not supported for form parsing`,
    );
  }
}
