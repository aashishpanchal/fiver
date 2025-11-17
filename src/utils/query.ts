import {tryDecode} from './url';

/** Decode percent & '+' safely */
const _decodeURI = (value: string) => {
  if (!/[%+]/.test(value)) return value;
  // '+' → space
  if (value.indexOf('+') !== -1) {
    value = value.replace(/\+/g, ' ');
  }
  // Only decode if '%' exists
  return value.indexOf('%') !== -1
    ? tryDecode(value, decodeURIComponent)
    : value;
};

/**
 * Parse query parameters from a URL or raw query string.
 *
 * Overloads:
 * - getQuery(url) → returns all params as { key: value }
 * - getQuery(url, key) → returns a single value or undefined
 * - getQuery(url, key, true) → returns array values for the key
 * - getQuery(url, undefined, true) → returns all params as arrays
 *
 * @param url - Full URL
 * @param key - Optional key to extract
 * @param multiple - When true, returns arrays instead of single values
 */
export function getQuery(url: string): Record<string, string>;
export function getQuery(url: string, key: string): string | undefined;
export function getQuery(
  url: string,
  key: string,
  multiple: true,
): string[] | undefined;
export function getQuery(
  url: string,
  key: undefined,
  multiple: true,
): Record<string, string[]>;
export function getQuery(url: string, key?: string, multiple?: boolean): any {
  let encoded;

  if (!multiple && key && !/[%+]/.test(key)) {
    // optimized for unencoded key

    let keyIndex = url.indexOf('?', 8);
    if (keyIndex === -1) {
      return undefined;
    }
    if (!url.startsWith(key, keyIndex + 1)) {
      keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
    }
    while (keyIndex !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex + key.length + 2;
        const endIndex = url.indexOf('&', valueIndex);
        return _decodeURI(
          url.slice(valueIndex, endIndex === -1 ? undefined : endIndex),
        );
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return '';
      }
      keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
    }

    encoded = /[%+]/.test(url);
    if (!encoded) {
      return undefined;
    }
    // fallback to default routine
  }

  const results: Record<string, string> | Record<string, string[]> = {};
  encoded ??= /[%+]/.test(url);

  let keyIndex = url.indexOf('?', 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf('&', keyIndex + 1);
    let valueIndex = url.indexOf('=', keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1
        ? nextKeyIndex === -1
          ? undefined
          : nextKeyIndex
        : valueIndex,
    );
    if (encoded) {
      name = _decodeURI(name);
    }

    keyIndex = nextKeyIndex;

    if (name === '') {
      continue;
    }

    let value;
    if (valueIndex === -1) {
      value = '';
    } else {
      value = url.slice(
        valueIndex + 1,
        nextKeyIndex === -1 ? undefined : nextKeyIndex,
      );
      if (encoded) {
        value = _decodeURI(value);
      }
    }

    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      (results[name] as string[]).push(value);
    } else {
      results[name] ??= value;
    }
  }

  return key ? results[key] : results;
}
