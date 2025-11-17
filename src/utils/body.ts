import uws from '../../uws';
import {formatBytes} from '@/utils/tools';

export type FileType = {
  bytes: number;
  filename: string;
  mimeType: string;
  extension: string;
  readable: string;
  buffer: Buffer;
};

export type FormOption = {
  /** Allowed file fields (omit to allow any). */
  fileFields?: string | string[];
  /** Max single file size in bytes (default: 5 MB). */
  fileSize?: number;
  /** Max number of files (default: 5). */
  files?: number;
};

/**
 * Simple FormData-like container for Node.
 * Supports multiple values per key and JSON conversion.
 */
export class FormData extends Map<string, any> {
  /**
   * Appends a new value for the given key.
   * If the key already exists, converts the value into an array
   * and pushes the new value into it.
   *
   * @param name - The key name.
   * @param value - The value to append.
   */
  append(key: string, value: any) {
    const current = this.get(key);
    if (current === undefined) {
      this.set(key, value);
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      this.set(key, [current, value]);
    }
  }

  /**
   * Returns the first value associated with the given key.
   * If multiple values exist, only the first one is returned.
   *
   * @param name - The key to look up.
   * @returns The first value, or `undefined` if not found.
   */
  get<T>(name: string): T {
    const val = super.get(name);
    return Array.isArray(val) ? val[0] : val;
  }

  /**
   * Returns all values associated with the given key.
   * Always returns an array (empty if key not found).
   *
   * @param name - The key to look up.
   * @returns An array of values.
   */
  getAll<T>(key: string): T[] {
    const v = super.get(key);
    return Array.isArray(v) ? v : v !== undefined ? [v] : [];
  }

  /**
   * Converts the entire form to a plain JavaScript object.
   *
   * @returns A `Record<string, any>` containing all keys and values.
   */
  toJSON() {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.entries()) {
      obj[k] = v;
    }
    return obj;
  }
}

export const isFileType = (v: any): v is FileType =>
  v &&
  typeof v === 'object' &&
  Buffer.isBuffer(v.buffer) &&
  typeof v.filename === 'string' &&
  typeof v.mimeType === 'string';

/**
 * Parse multipart/form-data bodies from a readable stream.
 */
export const formParse = (
  buf: Buffer,
  cType: string,
  options: FormOption = {},
): FormData => {
  const {files = 5, fileSize = 5 * 1024 * 1024, fileFields} = options;
  const form = new FormData();
  // Parse data
  const parts = uws.getParts(buf, cType);
  if (parts) {
    let fileCount = 0;
    parts.forEach(part => {
      const {name, data, filename, type: mimeType} = part;
      // Convert ArrayBuffer → Buffer safely
      const buffer = Buffer.from(data);
      // === Normal text field ===
      if (!filename || !mimeType) {
        const value = buffer.toString('utf8');
        form.append(name, value);
        return;
      }
      // === File field ===
      fileCount++;
      if (fileCount > files)
        throw new Error(
          `Too many files uploaded. Maximum allowed: ${files}, received: ${fileCount}`,
        );
      if (
        fileFields &&
        !(
          (Array.isArray(fileFields) && fileFields.includes(name)) ||
          fileFields === name
        )
      )
        throw new Error(`File upload not allowed for field '${name}'`);
      if (buffer.byteLength > fileSize)
        throw new RangeError(
          `File '${filename}' is ${formatBytes(buffer.byteLength)}, max allowed ${formatBytes(fileSize)}`,
        );
      const ext = filename.includes('.')
        ? filename.split('.').pop()!.toLowerCase().slice(0, 10)
        : '';
      const fileInfo: FileType = {
        filename,
        mimeType: mimeType.slice(0, 100),
        extension: ext,
        readable: formatBytes(buffer.length),
        bytes: buffer.length,
        buffer,
      };
      form.append(name, fileInfo);
    });
  }
  return form;
};
