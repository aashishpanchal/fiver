/**
 * Convert bytes to human readable format
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)}${sizes[i]}`;
};

export const isPromise = (value: any): value is Promise<any> =>
  value != null && typeof value.then === 'function';

/** Ensure request was not aborted before reading body */
export const safeReadBody = (
  action: string,
  method: string,
  isRead: boolean,
  aborted: boolean,
) => {
  if (!isRead)
    throw new Error(
      `Cannot read body for HTTP method '${method}'. ` +
        `To allow this, add the method to 'methods' when constructing Fiber.`,
    );
  if (aborted)
    throw new Error(`Cannot read ${action}: request was aborted by the client`);
};
