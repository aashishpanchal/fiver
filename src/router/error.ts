/**
 * Error class representing an unsupported path error.
 */
export class UnsupportedPathError extends Error {
  constructor(path: string) {
    super(`Unsupported path pattern: ${path}`);
    this.name = 'UnsupportedPathError';
  }
}
