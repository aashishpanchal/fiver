import {SmartRouter} from './smart';
import {mergePath} from '@/utils/url';
import {TrieRouter} from './trie-tree';
import {RegExpRouter} from './reg-exp';
import {METHOD_NAME_ALL, METHOD_NAME_ALL_LOWERCASE, METHODS} from '@/consts';
import type {
  Handler,
  RouterRoute,
  $404Handler,
  ErrorHandler,
  Router as IRouter,
  Middleware,
} from '@/types';
import {compose} from './compose';

// Default Handlers
const onNotFound: $404Handler = ctx =>
  ctx.status(404).json({
    message: `Cannot ${ctx.url} on ${ctx.method}`,
  });

const onError: ErrorHandler = (err, ctx) => {
  console.error(err);
  ctx.text('Internal Server Error', 500);
};

// Symbol-based private keys (exported for controlled access)
export const kNotFound = Symbol('notFound');
export const kErrorHandler = Symbol('errorHandler');

/**
 * Lightweight, router built on top of a RegExp/Trie based matcher.
 * Supports single or multiple route matchers (Trie, RegExp, or both).
 * like multi-router delegation and single-router optimization.
 */
export class Router {
  routes: RouterRoute[] = [];
  #basePath = '/';
  #path = '/';
  router: IRouter<[Handler, RouterRoute]>;

  // Symbol-based private handlers
  [kNotFound]: $404Handler = onNotFound;
  [kErrorHandler]: ErrorHandler = onError;

  /** Register a GET route. */
  get!: (path: string, ...handlers: Handler[]) => this;
  /** Register a POST route. */
  post!: (path: string, ...handlers: Handler[]) => this;
  /** Register a PUT route. */
  put!: (path: string, ...handlers: Handler[]) => this;
  /** Register a DELETE route. */
  delete!: (path: string, ...handlers: Handler[]) => this;
  /** Register a PATCH route. */
  patch!: (path: string, ...handlers: Handler[]) => this;
  /** Register a HEAD route. */
  head!: (path: string, ...handlers: Handler[]) => this;
  /** Register an OPTIONS route. */
  options!: (path: string, ...handlers: Handler[]) => this;
  /** Register a route matching any HTTP method. */
  all!: (path: string, ...handlers: Handler[]) => this;

  constructor() {
    // Dynamically assign route registration methods
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach(method => {
      this[method] = (arg1: string | Handler, ...args: Handler[]) => {
        const path = typeof arg1 === 'string' ? arg1 : this.#path;
        if (typeof arg1 !== 'string') this.#addRoute(method, path, arg1);
        args.forEach(handler => this.#addRoute(method, path, handler));
        return this as any;
      };
    });
    // Router assignment
    this.router = new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()],
    });
  }

  /**
   * Register a route for one or more HTTP methods and paths.
   *
   * @param method - A single method or an array of methods (e.g. `'get'`, `'post'`).
   * @param path - A single path or an array of paths.
   * @param handlers - One or more handlers to attach.
   * @returns This router instance (for chaining).
   *
   * @example
   * ```ts
   * router.on(['get', 'post'], ['/user', '/account'], handler);
   * ```
   */
  on = (
    method: string | string[],
    path: string | string[],
    ...handlers: Handler[]
  ): Router => {
    for (const p of [path].flat()) {
      this.#path = p;
      for (const m of [method].flat()) {
        handlers.forEach(handler =>
          this.#addRoute(m.toUpperCase(), this.#path, handler),
        );
      }
    }
    return this;
  };

  /**
   * Registers middleware handlers.
   * Works similarly to `app.use()` in Express.
   *
   * @param arg1 - Path string or the first handler function.
   * @param handlers - Additional handler functions.
   * @returns This router instance.
   *
   * @example
   * ```ts
   * router.use(authMiddleware);
   * router.use('/api', apiMiddleware);
   * ```
   */
  use = (arg1: string | Middleware, ...handlers: Middleware[]): Router => {
    if (typeof arg1 === 'string') {
      this.#path = arg1;
    } else {
      this.#path = '*';
      handlers.unshift(arg1);
    }
    handlers.forEach(handler =>
      this.#addRoute(METHOD_NAME_ALL, this.#path, handler),
    );
    return this;
  };

  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler: ErrorHandler): Router => {
    this[kErrorHandler] = handler;
    return this;
  };

  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @param {$404Handler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler: $404Handler): Router => {
    this[kNotFound] = handler;
    return this;
  };

  /**
   * `.route()` allows grouping other Fiber instance in routes.
   *
   * @param {string} path - base Path
   * @param {Router} router - other Router instance
   * @returns {Router} routed Router instance
   *
   * @example
   * ```ts
   * const app = new Router()
   * const app2 = new Router()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path: string, router: Router): void {
    if (router === this) throw new Error('Cannot mount router onto itself');
    const base = mergePath(this.#basePath, path);
    // merge routes (Shadow Copy)
    router.routes.forEach(r => {
      let handler: Handler;
      if (router[kErrorHandler] === onError) {
        handler = r.handler;
      } else {
        handler = async (c, next) =>
          await compose([], {onError: router[kErrorHandler]})(
            c,
            () => r.handler(c, next) as any,
          );
      }
      this.#addRoute(r.method, mergePath(base, r.path), handler);
    });
  }

  /**
   * Internal method that registers a route into the internal matcher.
   */
  #addRoute(method: string, path: string, handler: Handler): void {
    method = method.toUpperCase();
    const fullPath = mergePath(this.#basePath, path);
    const r: RouterRoute = {
      path: fullPath,
      method,
      handler,
      basePath: this.#basePath,
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
}
