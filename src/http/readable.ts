import {Readable} from 'stream';
import {HttpError} from '@/errors';
import {HIGH_WATER_MARK} from '@/consts';
import {type BufferArray} from '@/types';
import {formatBytes} from '@/utils/tools';
import type {HttpResponse} from '../../uws';

const kUwsRead = Symbol('uws-readable');

type UwsRead = {
  buffer: BufferArray | null;
  chunks: BufferArray[];
  bytes: number;
  isDone: boolean;
};

export class UwsReadable extends Readable {
  // Mode flags
  #needsData = false;
  #completed = false;
  #usedStream = false; // true when _read has been used
  #usedBuffer = false; // true when getBuffer() was called

  // symbol-based data
  [kUwsRead]: UwsRead = {
    bytes: 0,
    chunks: [],
    isDone: false,
    buffer: null,
  };

  constructor(res: HttpResponse, limit?: number) {
    super({
      highWaterMark: HIGH_WATER_MARK,
    });
    // uWS onData handler
    res.onData((chunk, isLast) => {
      if (this.destroyed) return;
      // We MUST copy the data of chunk if isLast is not true.
      const buf = isLast
        ? Buffer.from(chunk) // safe, no extra copy
        : Buffer.from(new Uint8Array(chunk)); // required copy
      this[kUwsRead].chunks.push(buf);
      this[kUwsRead].bytes += buf.length;
      if (typeof limit !== 'undefined' && this[kUwsRead].bytes > limit) {
        // Exceeded allowed body size -> destroy stream with error
        return this.destroy(
          new HttpError(413, {
            message: `Request body ${formatBytes(this[kUwsRead].bytes)} exceeds limit: ${formatBytes(limit)}`,
          }),
        );
      }
      if (isLast) {
        this[kUwsRead].isDone = true;
        // If buffer-mode or there's a listener for 'complete' and not using stream, trigger complete
        // Also ensure we don't mix with stream mode.
        if (
          !this.#usedStream &&
          !this.#completed &&
          (this.#usedBuffer || this.listenerCount('complete') > 0)
        ) {
          this.#complete();
        }
      }
      // Only trigger _read if in streaming mode (someone has asked for stream data).
      if (this.#needsData) {
        this.#needsData = false;
        // call _read to push whatever we have now
        this._read();
      }
    });
  }

  override _read() {
    // If user already requested buffer-mode earlier, disallow streaming reads
    if (this.#usedBuffer) {
      // Destroy with an explicit error to prevent mixing modes.
      this.destroy(
        new Error('Cannot read stream after getBuffer() has been called'),
      );
      return;
    }
    this.#usedStream = true;
    // Push as many buffered chunks as possible respecting backpressure
    while (this[kUwsRead].chunks.length > 0) {
      const chunk = this[kUwsRead].chunks.shift()!;
      // If push returns false, stop pushing (backpressure)
      if (!this.push(chunk)) break;
    }
    // If the uWS body is complete and no chunks left, signal EOF
    if (this[kUwsRead].isDone && this[kUwsRead].chunks.length === 0) {
      this.push(null);
    } else if (this[kUwsRead].chunks.length === 0) {
      // mark that we're waiting for more data
      this.#needsData = true;
    }
  }

  override _destroy(
    err: Error | null,
    cb: (error?: Error | null) => void,
  ): void {
    // sanitize internal buffers and flags
    const r = this[kUwsRead];
    r.isDone = true;
    r.chunks = [];
    r.buffer = null;
    this.#needsData = false;
    this.#completed = false;
    super._destroy(err, cb);
  }

  override once(event: string | symbol, listener: (...args: any[]) => void) {
    if (event === 'complete') {
      // Prevent mixing stream mode with buffer mode
      if (this.#usedStream)
        throw new Error('Cannot use complete event after stream has been read');
      // If already completed, immediately call with cached body
      if (this.#completed && this[kUwsRead].buffer) {
        queueMicrotask(() => listener(this[kUwsRead].buffer!));
        return this;
      }
      // If done but not completed yet, trigger completion now
      if (this[kUwsRead].isDone && !this.#completed) {
        this.#complete();
      }
    }
    return super.once(event, listener);
  }

  #bodyBuf = (): BufferArray => {
    // Return cached buffer if available
    if (this[kUwsRead].buffer) return this[kUwsRead].buffer;
    // Optimize for common cases
    const chunksLen = this[kUwsRead].chunks.length;
    let buffer: BufferArray;
    if (chunksLen === 0) {
      // If there's exactly one chunk, use it directly
      buffer = Buffer.allocUnsafe(0);
    } else if (chunksLen === 1) {
      buffer = this[kUwsRead].chunks[0]!;
    } else {
      // Provide total length for optimal concat
      buffer = Buffer.concat(this[kUwsRead].chunks, this[kUwsRead].bytes);
    }
    // Cache the buffer and clear chunks to free memory
    this[kUwsRead].buffer = buffer;
    this[kUwsRead].chunks = [];
    return buffer;
  };

  #complete = () => {
    if (this.#completed) return;
    this.#completed = true;
    // Defer buffer creation and emission to next microtask tick
    queueMicrotask(() => {
      if (this.destroyed) return;
      // build buffer lazily
      const body = this.#bodyBuf();
      this.emit('complete', body);
    });
  };

  getBuffer = (): Promise<BufferArray> =>
    new Promise<BufferArray>((resolve, reject) => {
      if (this.destroyed) return reject(new Error('Stream has been destroyed'));
      if (this.#usedStream)
        return reject(
          new Error('Cannot get buffer after stream has been read'),
        );
      // mark buffer mode permanently (prevents future streaming)
      this.#usedBuffer = true;
      // If already completed → return immediately
      if (this[kUwsRead].isDone) return resolve(this.#bodyBuf());
      // Handlers
      const onComplete = (buffer: BufferArray) => {
        cleanup();
        resolve(buffer);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Stream closed before completion'));
      };
      const cleanup = () => {
        this.off('error', onError);
        this.off('close', onClose);
        this.off('complete', onComplete);
      };
      // Attach handlers
      this.once('error', onError);
      this.once('close', onClose);
      this.once('complete', onComplete);
      // Edge case: destroy happened right after listeners attached
      if (this.destroyed) {
        cleanup();
        return reject(new Error('Stream has been destroyed'));
      }
    });
}
