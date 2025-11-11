import {UwsContext} from '../core';
import type {$404Handler, ErrorHandler, Next} from '../types';

export type Middleware = [[Function, unknown], unknown][] | [[Function]][];

type Options = {
  onError?: ErrorHandler;
  onNotFound?: $404Handler;
};

/**
 * Compose middleware functions into a single function based on `koa-compose` package.
 */
export const compose =
  (
    middleware: Middleware,
    options?: Options,
  ): ((context: UwsContext, next?: Next) => Promise<void>) =>
  (ctx, next) => {
    let index = -1;

    return dispatch(0);

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;
      let handler;

      if (middleware[i]) {
        handler = middleware[i][0][0];
        ctx.routeIndex = i;
      } else {
        handler = (i === middleware.length && next) || undefined;
      }

      if (handler) {
        try {
          await handler(ctx, () => dispatch(i + 1));
        } catch (err) {
          if (options?.onError) {
            await options.onError(err as Error, ctx);
          } else {
            throw err;
          }
        }
      } else if (options?.onNotFound) {
        await options.onNotFound(ctx);
      }
    }
  };
