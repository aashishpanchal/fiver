import {describe, it, expect} from 'vitest';
import {formatBytes, parseBytes, isPromise, ByteString} from '@/utils/tools';

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(500)).toBe('500.0B');
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(1048576)).toBe('1.0MB');
    expect(formatBytes(1073741824)).toBe('1.0GB');
  });
});

describe('parseBytes', () => {
  it('parses valid byte strings', () => {
    expect(parseBytes('500B')).toBe(500);
    expect(parseBytes('1KB')).toBe(1024);
    expect(parseBytes('1.5KB')).toBe(1536);
  });

  it('handles lowercase runtime input', () => {
    expect(parseBytes('1kb' as ByteString)).toBe(1024);
  });

  it('throws on invalid format', () => {
    // compile-time check
    parseBytes('12 KB');

    // runtime invalid strings
    expect(() => parseBytes('ABC' as unknown as ByteString)).toThrow();
    expect(() => parseBytes('12TB' as unknown as ByteString)).toThrow();
  });
});

describe('formatBytes + parseBytes', () => {
  it('reverses values following the same rounding logic', () => {
    const values = [0, 500, 1024, 1500, 500000];

    for (const val of values) {
      const str = formatBytes(val);
      const parsed = parseBytes(str);

      const index = Math.floor(Math.log(val || 1) / Math.log(1024));
      const rounded = parseFloat((val / 1024 ** index).toFixed(1));
      const expected = Math.round(rounded * 1024 ** index);

      expect(parsed).toBe(expected);
    }
  });
});

describe('isPromise', () => {
  it('detects real promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });
});
