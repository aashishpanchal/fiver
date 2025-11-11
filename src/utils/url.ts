type Decoder = (str: string) => string;

export const tryDecode = (str: string, decoder: Decoder): string => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, match => {
      try {
        return decoder(match);
      } catch {
        return match;
      }
    });
  }
};

/**
 * Detects and expands optional parameters in a route path.
 *
 * Example:
 *   /api/animals/:type?
 *   → ['/api/animals', '/api/animals/:type']
 *
 * If there is no optional parameter, returns null.
 */
export const checkOptionalParameter = (path: string): string[] | null => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(':')) {
    return null;
  }

  const segments = path.split('/');
  const results: string[] = [];
  let basePath = '';

  for (const segment of segments) {
    if (segment && !segment.includes(':')) {
      // Normal static segment — just append it
      basePath += '/' + segment;
    } else if (segment.includes(':')) {
      // Handle parameterized segments
      if (segment.includes('?')) {
        // If it's optional, include both versions
        results.push(basePath === '' ? '/' : basePath);
        const optionalSegment = segment.replace('?', '');
        basePath += '/' + optionalSegment;
        results.push(basePath);
      } else {
        basePath += '/' + segment;
      }
    }
  }

  // Remove duplicates (just in case)
  return [...new Set(results)];
};

/**
 * Merge paths.
 * @param {string[]} ...paths - The paths to merge.
 * @returns {string} The merged path.
 * @example
 * mergePath('/api', '/users') // '/api/users'
 * mergePath('/api/', '/users') // '/api/users'
 * mergePath('/api', '/') // '/api'
 * mergePath('/api/', '/') // '/api/'
 */
export const mergePath: (...paths: string[]) => string = (
  base: string | undefined,
  sub: string | undefined,
  ...rest: string[]
): string => {
  if (rest.length) {
    sub = mergePath(sub as string, ...rest);
  }
  return `${base?.[0] === '/' ? '' : '/'}${base}${
    sub === '/'
      ? ''
      : `${base?.at(-1) === '/' ? '' : '/'}${sub?.[0] === '/' ? sub.slice(1) : sub}`
  }`;
};
