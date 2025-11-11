import uws from '../uws';
import type {Target} from './types';
import {compose} from './router/layer';
import {cInternal, UwsContext} from './core';
import {onError, onNotFound, Router} from './router';
import type {
  AppOptions,
  HttpRequest,
  HttpResponse,
  TemplatedApp,
  WebSocketBehavior,
} from '../uws';

export type FiverOptions = {
  target?: Target;
  http3?: boolean;
  methods?: string[];
  uwsOptions?: AppOptions;
  appName?: string;
};

/**
 * The Fiver class extends the functionality of the Router class.
 * It sets up routing and allows for custom options to be passed.
 */
export class Fiver extends Router {
  uwsApp: TemplatedApp;
  #methods?: string[];
  #protocol: 'http' | 'https' | 'http3' = 'http';
  /**
   * Creates an instance of the Fiver class.
   *
   * @param options - Optional configuration options for the Fiver instance.
   */
  constructor(options: FiverOptions = {}) {
    super(options?.target);
    this.#methods = options.methods ?? ['POST', 'PUT', 'PATCH'];
    const opts = options.uwsOptions ?? {};
    // Create the uWS App
    if (options.http3) {
      if (!opts.key_file_name || !opts.cert_file_name) {
        throw new Error(
          'HTTP/3 requires uwsOptions.key_file_name and uwsOptions.cert_file_name',
        );
      }
      this.uwsApp = (uws as any).H3App(opts);
      this.#protocol = 'http3';
    } else if (opts.key_file_name && opts.cert_file_name) {
      this.uwsApp = uws.SSLApp(opts);
      this.#protocol = 'https';
    } else {
      this.uwsApp = uws.App(opts);
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
    this.uwsApp.ws(pattern, behavior);
    return this;
  }

  #dispatch = (res: HttpResponse, req: HttpRequest): void => {
    const url = req.getUrl();
    const method = req.getMethod().toUpperCase();
    const effectiveMethod = method === 'HEAD' ? 'GET' : method;
    const matchResult = this.router.match(effectiveMethod, url);
    // UwsContext Instance
    const ctx = new UwsContext({
      req,
      res,
      matchResult: matchResult,
      methods: this.#methods,
    });
    const handleHeadRequest = () => {
      if (method === 'HEAD' && !ctx.aborted && !ctx[cInternal].ended) {
        ctx.res.end();
        ctx[cInternal].ended = true;
      }
    };
    try {
      // If no match
      if (!matchResult) {
        onNotFound(ctx);
        return;
      }
      // Do not `compose` if it has only one handler
      const handlers = matchResult[0];
      if (handlers.length === 1) {
        try {
          const fn = handlers[0][0][0];
          const result = fn(ctx, async () => {
            await onNotFound(ctx);
          });
          if (result instanceof Promise) {
            result.catch(async (err: Error) => await onError(err, ctx));
          }
        } catch (err) {
          onError(err as Error, ctx);
        }
        handleHeadRequest();
        return;
      }
      compose(matchResult[0], {onError, onNotFound})(ctx);
      handleHeadRequest();
    } catch (err) {
      onError(err as Error, ctx);
    }
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
    if (args.length > 3) throw new Error('Only accept three arguments');
    // Register router
    this.uwsApp.any('/*', this.#dispatch);
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
      const protocol =
        this.#protocol === 'http3'
          ? 'http3'
          : this.#protocol === 'https'
            ? 'https'
            : 'http';
      const address =
        typeof port === 'number'
          ? `${protocol}://${host ?? '0.0.0.0'}:${port}`
          : port;
      cb?.(address);
    };
    if (typeof port === 'string' && isNaN(Number(port))) {
      // Unix socket
      this.uwsApp.listen_unix(onListen, port);
    } else {
      const numericPort = Number(port);
      if (host) (this.uwsApp as any).listen(host, numericPort, onListen);
      else (this.uwsApp as any).listen(numericPort, onListen);
    }
  }
}
