import qs from 'node:querystring';
import {tryDecode} from '@/utils/url';
import {getQuery} from '@/utils/query';
import {UwsReadable} from './readable';
import {kCtxReq, kMatch} from '@/consts';
import type {HttpRequest, HttpResponse} from '../../uws';
import type {
  CustomHeader,
  Handler,
  RequestHeader,
  Result,
  RouterRoute,
} from '@/types';
import {FormOption, FormData, formParse} from '@/utils/body';

const tryDecodeURIComponent = (str: string) =>
  tryDecode(str, decodeURIComponent);

const discardedDuplicates = [
  'age',
  'authorization',
  'content-length',
  'content-type',
  'etag',
  'expires',
  'from',
  'host',
  'if-modified-since',
  'if-unmodified-since',
  'last-modified',
  'location',
  'max-forwards',
  'proxy-authorization',
  'referer',
  'retry-after',
  'server',
  'user-agent',
];

type ReqData = {
  body: Partial<{
    json: any;
    text: string;
    blob: Blob;
    arrayBuffer: ArrayBuffer;
    formData: FormData;
  }>;
  headers: Record<string, any>;
  routeIndex: number;
};

type Options = {
  req: HttpRequest;
  res: HttpResponse;
  isSSL: boolean;
  methods?: string[];
  bodyLimit?: number;
};

export class Request {
  readonly req: HttpRequest;
  readonly res: HttpResponse;
  /**
   * The URL pathname (without host or query).
   *
   * Always begins with `/`.
   *
   * @example
   * "/users/15"
   */
  path: string;
  /**
   * HTTP method in uppercase (e.g. `POST`, `GET`)
   */
  method: string;
  /**
   * The raw query string including the leading `?`, or empty string if none.
   *
   * @example
   * "?page=2&limit=10"
   * ""
   */
  urlQuery: string;
  isSSL: boolean;

  // Symbol-based private internal data
  [kCtxReq]: ReqData = {
    body: Object.create(null),
    headers: Object.create(null),
    routeIndex: 0,
  };
  [kMatch]!: Result<[Handler, RouterRoute]>;
  // Readable stream
  #stream?: UwsReadable;
  #rawHeader: [string, string][] = [];

  constructor({req, res, bodyLimit, methods, isSSL}: Options) {
    this.req = req;
    this.res = res;
    this.method = req.getCaseSensitiveMethod();
    const q = req.getQuery(); // "age=56"
    this.path = req.getUrl(); // "/67"
    this.urlQuery = q ? '?' + q : '';
    this.isSSL = isSSL;
    // FASTEST POSSIBLE: store raw headers
    req.forEach((key, value) => {
      this.#rawHeader.push([key, value]);
    });
    // Determine if this request method can have a body
    const isRead =
      ['POST', 'PUT', 'PATCH'].includes(this.method) ||
      ((methods && methods.includes(this.method)) as boolean);
    // Lazily create readable stream if needed
    if (isRead) {
      this.#stream = new UwsReadable(res, bodyLimit);
    }
  }

  protected destroy() {
    this[kCtxReq].body = Object.create(null);
    this.#stream?.destroy(new Error('Request cancelled during body read'));
  }

  /**
   * The full request URL including protocol, host, pathname, and query.
   *
   * @example
   * "http://localhost:3000/users/15?active=true"
   */
  get url(): string {
    const host = this.getHeader('Host');
    const protocol = this.isSSL ? 'https://' : 'http://';
    return protocol + host + this.path + this.urlQuery;
  }

  /**
   * Returns a single query param or the full query object.
   *
   * @example
   * req.query('q') // "hello"
   * req.query() // { q: "hello", page: "1" }
   */
  query(): Record<string, string>;
  query(key: string): string | undefined;
  query(key?: string): any {
    return getQuery(this.url, key as any);
  }

  /**
   * Returns array values for a query param or all params as arrays.
   *
   * @example
   * req.queries('tag') // ["a", "b"]
   * req.queries() // { tag: ["a","b"] }
   */
  queries(): Record<string, string[]>;
  queries(key: string): string[] | undefined;
  queries(key?: string): any {
    return getQuery(this.url, key as any, true);
  }

  /**
   * Returns the value of a named route parameter.
   *
   * @example
   * ```ts
   * ctx.param('id'); // "123"
   * ```
   */
  param(field: string): string | undefined {
    const paramKey = this[kMatch][0][this[kCtxReq].routeIndex][1][field];
    const param = this.#getParamValue(paramKey);
    return param && /%/.test(param) ? tryDecodeURIComponent(param) : param;
  }

  /**
   * Returns an object containing all route parameters for the current route.
   *
   * @example
   * ```ts
   * ctx.params(); // { id: "123", name: "John" }
   * ```
   */
  params(): Record<string, string> {
    const decoded: Record<string, string> = {};
    const keys = Object.keys(this[kMatch][0][this[kCtxReq].routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(
        this[kMatch][0][this[kCtxReq].routeIndex][1][key],
      );
      if (value !== undefined) {
        decoded[key] = /%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }

  /**
   * Resolves the parameter value from the match result.
   */
  #getParamValue = (paramKey: any): string | undefined =>
    this[kMatch][1] ? this[kMatch][1][paramKey] : paramKey;

  /**
   * Lazily normalizes and caches all request headers.
   */
  #buildHeader() {
    const store = this[kCtxReq].headers;
    if (Object.keys(store).length > 0) {
      return; // Already built
    }
    for (const [keyRaw, value] of this.#rawHeader) {
      const key = keyRaw.toLowerCase();
      // skip duplicate overwrite headers
      if (store[key]) {
        if (discardedDuplicates.includes(key)) continue;
        if (key === 'cookie') {
          store[key] += '; ' + value;
          continue;
        }
        if (key === 'set-cookie') {
          store[key].push(value);
          continue;
        }
        store[key] += ', ' + value;
        continue;
      }
      // initialize
      if (key === 'set-cookie') {
        store[key] = [value];
      } else {
        store[key] = value;
      }
    }
  }

  /**
   * Returns raw header pairs in their original order.
   */
  get rawHeaders(): string[] {
    const arr: string[] = [];
    for (const [k, v] of this.#rawHeader) {
      arr.push(k, v);
    }
    return arr;
  }

  /**
   * Returns a specific request header,
   * or all headers if no name is provided.
   *
   * @example
   * ```ts
   * req.getHeader('content-type'); // => "application/json"
   * req.getHeader(); // => { host: "localhost:3000", ... }
   * ```
   */
  getHeader(field: RequestHeader): string | undefined;
  getHeader(field: string): string | undefined;
  getHeader(): Record<RequestHeader | (string & CustomHeader), string>;
  getHeader(field?: string): any {
    this.#buildHeader();
    const headers = this[kCtxReq].headers;
    if (!field) return headers;
    const key = field.toLowerCase();
    if (key === 'referrer' || key === 'referer')
      return headers['referrer'] || headers['referer'];
    return headers[key];
  }

  /**
   * Returns a readable stream of the request body.
   *
   * @example
   * ```ts
   * const file = fs.createWriteStream('upload.bin');
   * ctx.stream.pipe(file);
   * ```
   */
  get stream(): UwsReadable {
    if (this.#stream && !this.#stream.destroyed) return this.#stream;
    throw new Error(
      `Cannot access request body stream for HTTP method '${this.method}'.`,
    );
  }

  /**
   * Reads and returns the request body as a UTF-8 string.
   *
   * @example
   * ```ts
   * const text = await ctx.textParse();
   * console.log('Body:', text);
   * ```
   */
  async textParse(): Promise<string> {
    const body = this[kCtxReq].body;
    if (body.text) return body.text;
    const buf = await this.stream.getBuffer();
    const text = buf.toString('utf-8').trim();
    body.text = text;
    return text;
  }

  /**
   * Reads and returns the request body as an ArrayBuffer.
   *
   * @example
   * ```ts
   * const arrayBuffer = await ctx.arrayBuffer();
   * console.log(arrayBuffer.byteLength);
   * ```
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    const body = this[kCtxReq].body;
    if (body.arrayBuffer) return body.arrayBuffer;
    const buffer = await this.stream.getBuffer();
    // Convert Node Buffer → ArrayBuffer safely
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    body.arrayBuffer = arrayBuffer;
    return arrayBuffer;
  }

  /**
   * Reads the body as a Blob (Node 18+).
   *
   * @example
   * ```ts
   * const blob = await ctx.blobParse();
   * console.log('Blob size:', blob.size);
   * ```
   *
   * @returns {Promise<Blob>}
   */
  async blobParse(): Promise<Blob> {
    const body = this[kCtxReq].body;
    if (body.blob) return body.blob;
    const type = this.getHeader('Content-Type') || 'application/octet-stream';
    const arrayBuffer = await this.arrayBuffer();
    const blob = new Blob([arrayBuffer], {type});
    body.blob = blob;
    return blob;
  }

  /**
   * Parses and returns the request body as JSON.
   *
   * @template T
   * @returns {Promise<T>} The parsed JSON body.
   * @throws {SyntaxError} If body is empty or malformed.
   *
   * @example
   * ```ts
   * const data = await ctx.jsonParse();
   * console.log(data.user, data.email);
   * ```
   */
  async jsonParse<T = any>(): Promise<T> {
    const body = this[kCtxReq].body;
    if (body.json) return body.json;
    const text = await this.textParse();
    if (!text) throw new SyntaxError('Empty request body, expected JSON');
    try {
      const json = JSON.parse(text);
      body.json = json;
      return json;
    } catch (err: any) {
      throw new SyntaxError(`Invalid JSON body: ${err.message}`);
    }
  }

  /**
   * Parses form submissions (URL-encoded or multipart/form-data).
   *
   * @param {FormOption} [options] - Optional multipart parser settings.
   * @returns {Promise<FormData>}
   * @throws {TypeError} If content type is unsupported.
   *
   * @example
   * ```ts
   * const form = await ctx.formParse();
   * console.log(form.get('username'));
   * ```
   */
  async formParse(options?: FormOption): Promise<FormData> {
    const cType = (this.getHeader('content-type') || '').toLowerCase();
    const body = this[kCtxReq].body;
    if (body.formData) return body.formData;
    // Url Encode Form Data
    if (cType.startsWith('application/x-www-form-urlencoded')) {
      const form = new FormData();
      const text = await this.textParse();
      if (!text) throw new SyntaxError('Empty form data');
      try {
        const parsed = qs.parse(text);
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) {
            for (const item of v) form.append(k, item);
          } else {
            form.append(k, v);
          }
        }
        body.formData = form;
        return form;
      } catch (error) {
        throw new SyntaxError('Malformed URL-encoded data');
      }
    }
    // multipart Encode Form Data
    else if (cType.startsWith('multipart/form-data')) {
      // Get buffer from stream (cached in UwsReadable)
      const buf = await this.stream.getBuffer();
      const form = formParse(buf, cType, options);
      body.formData = form;
      return form;
    }
    throw new TypeError(
      `Content-Type '${cType}' not supported for form parsing`,
    );
  }
}
