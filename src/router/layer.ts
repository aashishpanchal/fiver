import {UwsCtx} from '../core';
import type {$404Handler, ErrorHandler, Next} from '../types';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type Middleware = [[Function, unknown], unknown][] | [[Function]][];

type Options = {
  onError?: ErrorHandler;
  onNotFound?: $404Handler;
};

/**
 * Compose multiple middleware functions into a single async callable function.
 */
export const compose =
  (
    middleware: Middleware,
    options?: Options,
  ): ((context: UwsCtx, next?: Next) => Promise<void>) =>
  (ctx, next) => {
    const index = -1;

    return dispatch(0);

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      const current = middleware[i];
      const handler =
        current?.[0][0] || (i === middleware.length && next) || undefined;
      // No more middleware → maybe call onNotFound
      if (!handler) {
        if (options?.onNotFound) await options.onNotFound(ctx);
        return;
      }
      // Run chain middlewares
      try {
        await handler(ctx, () => dispatch(i + 1));
      } catch (err) {
        if (options?.onError) {
          await options.onError(err as Error, ctx);
        } else {
          throw err;
        }
      }
    }
  };
