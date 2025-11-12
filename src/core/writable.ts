import {TextEncoder} from 'util';
import {Writable} from 'node:stream';
import {kResData, type UwsCtx} from './uws-ctx';

/**
 * UwsStream — Node-native Writable for uWebSockets.js
 * ---------------------------------------------------
 * - Extends Node's Writable for real backpressure
 * - Optimized cork batching + zero-copy buffer slices
 * - Context-integrated (auto-closes on client abort)
 * - Supports both .write()/.writeln() and pipe(Readable)
 * - Minimal memory use + no WebStreams dependency
 */
export class UwsWritable extends Writable {
  #ctx: UwsCtx;
  #encoder = new TextEncoder();
  #headersSent = false;
  #pending: Buffer[] = [];
  #pendingSize = 0;
  #closed = false;
  #flushTimer?: NodeJS.Timeout;
  #maxPendingSize = 64 * 1024; // 64KB buffer limit

  constructor(ctx: UwsCtx) {
    super({
      highWaterMark: 16 * 1024, // 16KB chunks
      objectMode: false,
    });
    this.#ctx = ctx;

    // Auto-cleanup on client abort
    ctx.onAbort(() => {
      this.#clearTimer();
      this.destroy(new Error('Client disconnected'));
    });
  }

  #clearTimer(): void {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
  }

  /**
   * Ensure headers & status are sent once before streaming.
   */
  #ensureHeaders(): void {
    if (this.#headersSent) return;
    const internal = this.#ctx[kResData];
    const res = this.#ctx.res;
    const statusCode = internal.status || 200;

    res.cork(() => {
      res.writeStatus(String(statusCode));
      internal.headers.forEach((value, key) => {
        if (Array.isArray(value)) {
          for (const val of value) res.writeHeader(key, String(val));
        } else {
          res.writeHeader(key, String(value));
        }
      });
    });

    internal.headerSent = true;
    this.#headersSent = true;
  }

  /**
   * Convert string or Buffer to Uint8Array
   */
  #toUint8(chunk: string | Buffer | Uint8Array): Uint8Array {
    if (typeof chunk === 'string') return this.#encoder.encode(chunk);
    if (Buffer.isBuffer(chunk))
      return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    return chunk;
  }

  /**
   * Internal flush — batches pending chunks and sends via cork.
   */
  #flush(): boolean {
    if (this.#closed || this.#ctx.aborted || this.#pendingSize === 0)
      return true;

    this.#ensureHeaders();
    this.#clearTimer();

    const res = this.#ctx.res;
    const chunks = this.#pending;
    const buf =
      chunks.length === 1
        ? chunks[0]
        : Buffer.concat(chunks, this.#pendingSize);

    this.#pending.length = 0;
    this.#pendingSize = 0;

    try {
      const ab = buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      );
      const [ok, done] = res.tryEnd(ab as any, buf.byteLength);

      if (done) {
        this.#closed = true;
      }

      return ok;
    } catch (err) {
      this.destroy(err as Error);
      return false;
    }
  }

  /**
   * Node stream _write() — supports backpressure
   */
  _write(
    chunk: any,
    _encoding: BufferEncoding,
    cb: (error?: Error | null) => void,
  ): void {
    if (this.#closed || this.#ctx.aborted) {
      return cb(new Error('Response closed or aborted'));
    }

    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, _encoding as BufferEncoding);

    this.#pending.push(buf);
    this.#pendingSize += buf.byteLength;

    // Immediate flush if buffer is full
    if (this.#pendingSize >= this.#maxPendingSize) {
      const success = this.#flush();
      if (!success) {
        // Backpressure: delay callback
        this.#flushTimer = setTimeout(() => cb(), 1);
        return;
      }
    } else {
      // Batch small writes
      if (!this.#flushTimer) {
        this.#flushTimer = setTimeout(() => this.#flush(), 0);
      }
    }

    cb();
  }

  /**
   * Node stream _final() — graceful finish
   */
  _final(cb: (error?: Error | null) => void): void {
    if (this.#closed || this.#ctx.aborted) return cb();

    this.#ensureHeaders();
    this.#flush();

    try {
      this.#ctx.res.cork(() => this.#ctx.res.end());
    } catch (err) {
      console.error('[UwsStream] final error:', err);
    } finally {
      this.#closed = true;
      cb();
    }
  }

  _destroy(err: Error | null, cb: (error?: Error | null) => void): void {
    this.#clearTimer();
    this.#pending.length = 0;
    this.#pendingSize = 0;
    this.#closed = true;

    if (!this.#ctx.aborted && err) {
      try {
        this.#ctx.res.close();
      } catch {
        // Ignore close errors
      }
    }

    super._destroy(err, cb);
  }

  /**
   * Manual write — convenient wrapper.
   */
  writeChunk(chunk: string | Buffer | Uint8Array): void {
    if (this.#closed || this.#ctx.aborted) return;
    this.#ensureHeaders();
    const data = this.#toUint8(chunk);
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    try {
      this.#ctx.res.cork(() => this.#ctx.res.write(ab as any));
    } catch (err) {
      console.error('[UwsStream] writeChunk error:', err);
    }
  }

  /**
   * Write line + newline.
   */
  writeln(line: string): void {
    this.writeChunk(line + '\n');
  }

  /**
   * Simple delay helper.
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gracefully end response.
   */
  close(): void {
    if (this.#closed || this.#ctx.aborted) return;
    this.#ensureHeaders();
    try {
      this.#ctx.res.cork(() => this.#ctx.res.end());
    } catch (err) {
      console.error('[UwsStream] close error:', err);
    } finally {
      this.#closed = true;
    }
  }

  /**
   * Force-abort socket.
   */
  abort(): void {
    if (this.#closed || this.#ctx.aborted) return;
    try {
      this.#ctx.res.close();
    } catch {
      // Ignore close errors
    }
    this.#closed = true;
  }
}
