import {getQuery} from '@/utils/query';
import {describe, it, expect} from 'vitest';

describe('getQuery()', () => {
  // Basic parsing
  it('parses flat query parameters', () => {
    const url = 'https://example.com/?page=2&active=true';
    const result = getQuery(url);
    expect(result).toEqual({page: '2', active: 'true'});
  });

  it('returns empty object when no query exists', () => {
    const url = 'https://example.com/';
    expect(getQuery(url)).toEqual({});
  });

  // Single key
  it('returns value for a specific key', () => {
    const url = 'https://example.com/?page=2';
    expect(getQuery(url, 'page')).toBe('2');
  });

  it('returns undefined for unknown key', () => {
    const url = 'https://example.com/?page=2';
    expect(getQuery(url, 'xxx')).toBeUndefined();
  });

  // Multiple values mode
  it('parses repeated keys as array when multiple=true', () => {
    const url = 'https://example.com/?tag=a&tag=b&tag=c';
    const result = getQuery(url, undefined, true);
    expect(result).toEqual({tag: ['a', 'b', 'c']});
  });

  it('gets a repeated key as array when multiple=true', () => {
    const url = 'https://example.com/?id=1&id=2';
    expect(getQuery(url, 'id', true)).toEqual(['1', '2']);
  });

  // Decoding
  it('decodes URL-encoded values', () => {
    const url = 'https://example.com/?name=Alice%20Smith';
    expect(getQuery(url, 'name')).toBe('Alice Smith');
  });

  it('decodes + as space', () => {
    const url = 'https://example.com/?q=hello+world';
    expect(getQuery(url, 'q')).toBe('hello world');
  });

  it('decodes both encoded and repeated values (multiple=true)', () => {
    const url = 'https://example.com/?q=a%20b&q=c%20d';
    expect(getQuery(url, 'q', true)).toEqual(['a b', 'c d']);
  });

  // Fast path cases
  it('fast-path: unencoded key lookup', () => {
    const url = 'https://example.com/?x=123&y=456';
    expect(getQuery(url, 'y')).toBe('456');
  });

  it('fast-path: returns empty string when key exists without value', () => {
    const url = 'https://example.com/?flag&x=1';
    expect(getQuery(url, 'flag')).toBe('');
  });

  // Edge cases
  it('handles keys without values', () => {
    const url = 'https://example.com/?flag';
    expect(getQuery(url)).toEqual({flag: ''});
  });

  it('handles mixed keys with and without values', () => {
    const url = 'https://example.com/?flag&x=1';
    expect(getQuery(url)).toEqual({flag: '', x: '1'});
  });

  it('handles empty names gracefully', () => {
    const url = 'https://example.com/?=abc';
    expect(getQuery(url)).toEqual({});
  });

  it('handles encoded keys', () => {
    const url = 'https://example.com/?na%6De=value';
    expect(getQuery(url)).toEqual({name: 'value'});
  });

  it('handles encoded keys (single key mode)', () => {
    const url = 'https://example.com/?na%6De=value';
    expect(getQuery(url, 'name')).toBe('value');
  });
});
