import {Readable} from 'node:stream';
import {BufferArray} from '../types';
import {formatBytes} from '../utils/tools';
import type {HttpResponse} from '../../uws';
import {HIGH_WATER_MARK, MAX_BYTES} from '../consts';

type Options = {
  res: HttpResponse;
  maxBytes?: number;
};

export class UwsReadable extends Readable {
  #chunks: BufferArray[] = [];
  #done = false;
  #usedStream = false;
  #needsData = false;
  #completed = false;
  #buffer?: BufferArray;

  constructor({res, maxBytes = MAX_BYTES}: Options) {
    super({highWaterMark: HIGH_WATER_MARK});
    let totalSize = 0;
    // Fired by uWebSockets when new request body data arrives
    // uWS reuses the same ArrayBuffer for performance — must copy immediately
    res.onData((chunk, isLast) => {
      if (this.destroyed) return;
      // Single copy - ArrayBuffer → Buffer
      // Always copy, never keep reference to uWS buffer
      const buf = Buffer.from(new Uint8Array(chunk));
      this.#chunks.push(buf);
      // Track total size.
      totalSize += buf.length;
      if (totalSize > maxBytes)
        return this.destroy(
          new RangeError(
            `Request body ${formatBytes(totalSize)} exceeds limit: ${formatBytes(maxBytes)}`,
          ),
        );
      if (isLast) {
        this.#done = true;
        if (!this.#usedStream && !this.#completed) this.#complete();
      }
      // Only trigger _read if in streaming mode.
      if (this.#needsData) {
        this.#needsData = false;
        this._read();
      }
    });
  }

  _read() {
    if (this.destroyed) return;
    let bytesToRead = HIGH_WATER_MARK;
    this.#usedStream = true;
    // Drain buffered chunks until we hit the chunk limit or run out
    while (bytesToRead > 0 && this.#chunks.length > 0) {
      const chunk = this.#chunks[0];
      if (chunk.length <= bytesToRead) {
        // Use entire chunk - no copy
        this.#chunks.shift();
        bytesToRead -= chunk.length;
        if (!this.push(chunk)) break;
      } else {
        // Split chunk using views - no copy
        const part = chunk.subarray(0, bytesToRead);
        this.#chunks[0] = chunk.subarray(bytesToRead);
        bytesToRead = 0;
        if (!this.push(part)) break;
      }
    }
    // If all chunks sent and request fully received → end stream
    if (this.#done && this.#chunks.length === 0) this.push(null);
    // If we ran out of chunks but more data might come later
    else if (this.#chunks.length === 0) this.#needsData = true;
  }

  _destroy(err: Error | null, cb: (error?: Error | null) => void): void {
    this.#chunks = [];
    this.#needsData = false;
    this.#done = true;
    this.#buffer = undefined;
    // Push null to make sure stream readers are released properly
    this.push(null);
    super._destroy(err, cb);
  }

  // Combine all chunks into a single Buffer
  #bodyBuf = () => {
    if (this.#buffer) return this.#buffer;
    const buffer =
      this.#chunks.length > 1
        ? Buffer.concat(this.#chunks)
        : (this.#chunks[0] ?? Buffer.alloc(0));
    // Cache the buffer and clear chunks
    this.#buffer = buffer;
    // Clear chunks after creating buffer to free memory
    this.#chunks = [];
    return buffer;
  };

  once(event: string | symbol, listener: (...args: any[]) => void) {
    if (event === 'complete') {
      // If already completed, immediately call with cached body
      if (this.#completed && this.#buffer) {
        queueMicrotask(() => listener(this.#buffer!));
        return this;
      }
      // If done but not completed yet, trigger completion
      if (this.#done && !this.#completed) {
        this.#complete();
      }
    }
    return super.once(event, listener);
  }

  #complete() {
    if (this.#completed) return;
    this.#completed = true;
    // Combine once for consistency and emit asynchronously
    const body = this.#bodyBuf();
    queueMicrotask(() => this.emit('complete', body));
  }
}
