type ByteUnit = 'B' | 'KB' | 'MB' | 'GB';

// "12KB", "1.5MB", etc.
export type ByteString = `${number}${ByteUnit}`;

/**
 * Convert bytes to human readable format
 */
export const formatBytes = (bytes: number): ByteString => {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)}${sizes[i]}` as ByteString;
};

export const parseBytes = (value: ByteString): number => {
  const units: Record<ByteUnit, number> = {B: 0, KB: 1, MB: 2, GB: 3};
  // Trim spaces and make sure format matches "<number><unit>"
  const match = value
    .trim()
    .toUpperCase()
    .match(/^([\d.]+)\s*(B|KB|MB|GB)$/);
  if (!match) {
    throw new Error(`Invalid byte format: "${value}"`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2] as keyof typeof units;
  return Math.round(num * Math.pow(1024, units[unit]));
};

export const isPromise = (value: any): value is Promise<any> =>
  value != null && typeof value.then === 'function';
