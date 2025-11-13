import uws from '../uws';
import path from 'node:path';
import {compose} from './router/layer';
import {kMatch, UwsCtx} from './core';
import {kErrorHandler, kNotFound, Router} from './router';
import type {
  AppOptions,
  HttpRequest,
  HttpResponse,
  TemplatedApp,
  WebSocketBehavior,
} from '../uws';
import {MAX_BYTES} from './consts';
import {isPromise} from './utils/tools';

export type FiberOptions = {
  http3?: boolean;
  methods?: string[];
  uwsOptions?: AppOptions;
  appName?: string;
};

/**
 * The Fiber class extends the functionality of the Router class.
 * It sets up routing and allows for custom options to be passed.
 */
export class Fiber extends Router {
  readonly uws: TemplatedApp;
  readonly #appName: string;
  readonly #methods?: string[];
  readonly #protocol: 'http' | 'https' | 'http3' = 'http';

  /**
   * Creates an instance of the Fiber class.
   *
   * @param options - Optional configuration options for the Fiber instance.
   */
  constructor(options: FiberOptions = {}) {
    super();
    this.#appName = options.appName || 'Fiber';
    this.#methods = options.methods ?? ['POST', 'PUT', 'PATCH'];
    const opts = options.uwsOptions ?? {};
    // Create the uWS App
    if (options.http3) {
      if (!opts.key_file_name || !opts.cert_file_name) {
        throw new Error(
          'HTTP/3 requires uwsOptions.key_file_name and uwsOptions.cert_file_name',
        );
      }
      this.uws = (uws as any).H3App(opts);
      this.#protocol = 'http3';
    } else if (opts.key_file_name && opts.cert_file_name) {
      this.uws = uws.SSLApp(opts);
      this.#protocol = 'https';
    } else {
      this.uws = uws.App(opts);
      this.#protocol = 'http';
    }
  }

  /**
   * Add WebSocket support
   *
   * @param pattern - URL pattern for WebSocket endpoint
   * @param behavior - WebSocket behavior configuration
   * @returns this for chaining
   *
   * @example
   * ```ts
   * app.ws('/chat', {
   *   message: (ws, message, opCode) => {
   *     ws.send(message);
   *   },
   *   open: (ws) => {
   *     console.log('WebSocket connected');
   *   }
   * });
   * ```
   */
  ws(pattern: string, behavior: WebSocketBehavior<any>): this {
    this.uws.ws(pattern, behavior);
    return this;
  }

  #dispatch = (res: HttpResponse, req: HttpRequest) => {
    // Create context with request instance
    const ctx = new UwsCtx({
      req,
      res,
      maxBytes: MAX_BYTES,
      methods: this.#methods,
      appName: this.#appName,
    });
    // Use request.method instead of duplicating getMethod()
    const matchResult = this.router.match(
      ctx.method === 'HEAD' ? 'GET' : ctx.method,
      ctx.url,
    );
    // Set matchResult on request
    ctx[kMatch] = matchResult;
    // If match-result not found
    if (!matchResult) return this[kNotFound](ctx);
    // Skip compose if only one handler
    if (matchResult[0].length === 1) {
      try {
        const result = matchResult[0][0][0][0](
          ctx,
          async () => await this[kNotFound](ctx),
        );
        if (isPromise(result))
          result.catch(err => this[kErrorHandler](err, ctx));
      } catch (err) {
        this[kErrorHandler](err as Error, ctx);
      }
    }
    // Compose middleware chain
    const composed = compose(matchResult[0], {
      onError: this[kErrorHandler],
      onNotFound: this[kNotFound],
    });
    const result = composed(ctx);
    if (isPromise(result)) result.catch(err => this[kErrorHandler](err, ctx));
  };

  listen(
    port: number,
    hostname: string,
    callback?: (url: string) => void | Promise<void>,
  ): void;
  listen(port: number, callback?: (url: string) => void | Promise<void>): void;
  listen(path: string, callback?: (url: string) => void | Promise<void>): void;
  listen(callback?: (url: string) => void): void;
  listen(...args: any[]): void {
    // Register router
    this.uws.any('/*', this.#dispatch);
    // Listen server
    let port: number | string = 0;
    let host: string | undefined;
    let cb: ((url: string) => void | Promise<void>) | undefined;
    // Normalize parameters
    if (typeof args[0] === 'function') {
      cb = args[0];
    } else if (typeof args[1] === 'function') {
      port = args[0];
      cb = args[1];
    } else {
      [port, host, cb] = args;
    }
    const onListen = (socket: any) => {
      if (!socket) {
        throw new Error(
          `Failed to listen on ${port}. No permission or address in use.`,
        );
      }
      let address: string;
      if (typeof port === 'string' && isNaN(Number(port))) {
        // It’s a Unix domain socket
        const normalizedPath =
          port.startsWith('/') || port.startsWith('./') ? port : `./${port}`;
        // Use absolute path for clarity
        address = path.resolve(normalizedPath);
      } else {
        address = `${this.#protocol}://${host ?? '0.0.0.0'}:${port}`;
      }
      cb?.(address);
    };
    if (typeof port === 'string' && isNaN(Number(port))) {
      // Unix socket
      this.uws.listen_unix(onListen, port);
    } else {
      const numericPort = Number(port);
      if (host) this.uws.listen(host, numericPort, onListen);
      else this.uws.listen(numericPort, onListen);
    }
  }
}
