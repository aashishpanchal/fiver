import type {Context} from './http';
import type {HttpError} from './errors';
import type {HttpRequest, HttpResponse} from 'uws';

export type UwsHttpRequest = HttpRequest;
export type UwsHttpResponse = HttpResponse;

////////////////////////////////////////
//////                            //////
//////           Handler          //////
//////                            //////
////////////////////////////////////////

export type Next = () => Promise<void>;
export type Middleware = (ctx: Context, next: Next) => Promise<void>;
export type Handler = (ctx: Context, next: Next) => void | Promise<void>;
export type $404Handler = (ctx: Context) => void | Promise<void>;
export type ErrorHandler = (
  err: Error | HttpError,
  ctx: Context,
) => void | Promise<void>;
export type BufferArray = Buffer<ArrayBuffer>;

////////////////////////////////////////
//////                            //////
//////           Router           //////
//////                            //////
////////////////////////////////////////

/**
 * Represents a single route definition.
 *
 * @template T - The type of the route handler (defaults to {@link Handler}).
 *
 * @example
 * ```ts
 * const route: RouterRoute = {
 *   basePath: '/api',
 *   path: '/users/:id',
 *   method: 'get',
 *   handler: handler,
 * };
 * ```
 */
export type RouterRoute = {
  path: string;
  method: string;
  basePath: string;
  handler: Handler;
};

/**
 * Interface representing a router.
 *
 * @template T - The type of the handler.
 */
export interface Router<T> {
  /**
   * The name of the router.
   */
  name: string;

  /**
   * Adds a route to the router.
   *
   * @param method - The HTTP method (e.g., 'get', 'post').
   * @param path - The path for the route.
   * @param handler - The handler for the route.
   */
  add(method: string, path: string, handler: T): void;

  /**
   * Matches a route based on the given method and path.
   *
   * @param method - The HTTP method (e.g., 'get', 'post').
   * @param path - The path to match.
   * @returns The result of the match.
   */
  match(method: string, path: string): Result<T>;
}

/**
 * Type representing a map of parameter indices.
 */
export type ParamIndexMap = Record<string, number>;
/**
 * Type representing a stash of parameters.
 */
export type ParamStash = string[];
/**
 * Type representing a map of parameters.
 */
export type Params = Record<string, string>;
/**
 * Type representing the result of a route match.
 *
 * The result can be in one of two formats:
 * 1. An array of handlers with their corresponding parameter index maps, followed by a parameter stash.
 * 2. An array of handlers with their corresponding parameter maps.
 *
 * Example:
 *
 * [[handler, paramIndexMap][], paramArray]
 * ```typescript
 * [
 *   [
 *     [middlewareA, {}],                     // '*'
 *     [funcA,       {'id': 0}],              // '/user/:id/*'
 *     [funcB,       {'id': 0, 'action': 1}], // '/user/:id/:action'
 *   ],
 *   ['123', 'abc']
 * ]
 * ```
 *
 * [[handler, params][]]
 * ```typescript
 * [
 *   [
 *     [middlewareA, {}],                             // '*'
 *     [funcA,       {'id': '123'}],                  // '/user/:id/*'
 *     [funcB,       {'id': '123', 'action': 'abc'}], // '/user/:id/:action'
 *   ]
 * ]
 * ```
 */
export type Result<T> = [[T, ParamIndexMap][], ParamStash] | [[T, Params][]];

////////////////////////////////////////
//////                            //////
//////           Header           //////
//////                            //////
////////////////////////////////////////

/**
 * @module
 * HTTP Headers utility.
 */
// note: https://www.iana.org/assignments/http-fields/http-fields.xhtml

export type RequestHeader =
  | 'A-IM'
  | 'Accept'
  | 'Accept-Additions'
  | 'Accept-CH'
  | 'Accept-Charset'
  | 'Accept-Datetime'
  | 'Accept-Encoding'
  | 'Accept-Features'
  | 'Accept-Language'
  | 'Accept-Patch'
  | 'Accept-Post'
  | 'Accept-Ranges'
  | 'Accept-Signature'
  | 'Access-Control'
  | 'Access-Control-Allow-Credentials'
  | 'Access-Control-Allow-Headers'
  | 'Access-Control-Allow-Methods'
  | 'Access-Control-Allow-Origin'
  | 'Access-Control-Expose-Headers'
  | 'Access-Control-Max-Age'
  | 'Access-Control-Request-Headers'
  | 'Access-Control-Request-Method'
  | 'Age'
  | 'Allow'
  | 'ALPN'
  | 'Alt-Svc'
  | 'Alt-Used'
  | 'Alternates'
  | 'AMP-Cache-Transform'
  | 'Apply-To-Redirect-Ref'
  | 'Authentication-Control'
  | 'Authentication-Info'
  | 'Authorization'
  | 'Available-Dictionary'
  | 'C-Ext'
  | 'C-Man'
  | 'C-Opt'
  | 'C-PEP'
  | 'C-PEP-Info'
  | 'Cache-Control'
  | 'Cache-Status'
  | 'Cal-Managed-ID'
  | 'CalDAV-Timezones'
  | 'Capsule-Protocol'
  | 'CDN-Cache-Control'
  | 'CDN-Loop'
  | 'Cert-Not-After'
  | 'Cert-Not-Before'
  | 'Clear-Site-Data'
  | 'Client-Cert'
  | 'Client-Cert-Chain'
  | 'Close'
  | 'CMCD-Object'
  | 'CMCD-Request'
  | 'CMCD-Session'
  | 'CMCD-Status'
  | 'CMSD-Dynamic'
  | 'CMSD-Static'
  | 'Concealed-Auth-Export'
  | 'Configuration-Context'
  | 'Connection'
  | 'Content-Base'
  | 'Content-Digest'
  | 'Content-Disposition'
  | 'Content-Encoding'
  | 'Content-ID'
  | 'Content-Language'
  | 'Content-Length'
  | 'Content-Location'
  | 'Content-MD5'
  | 'Content-Range'
  | 'Content-Script-Type'
  | 'Content-Security-Policy'
  | 'Content-Security-Policy-Report-Only'
  | 'Content-Style-Type'
  | 'Content-Type'
  | 'Content-Version'
  | 'Cookie'
  | 'Cookie2'
  | 'Cross-Origin-Embedder-Policy'
  | 'Cross-Origin-Embedder-Policy-Report-Only'
  | 'Cross-Origin-Opener-Policy'
  | 'Cross-Origin-Opener-Policy-Report-Only'
  | 'Cross-Origin-Resource-Policy'
  | 'CTA-Common-Access-Token'
  | 'DASL'
  | 'Date'
  | 'DAV'
  | 'Default-Style'
  | 'Delta-Base'
  | 'Deprecation'
  | 'Depth'
  | 'Derived-From'
  | 'Destination'
  | 'Differential-ID'
  | 'Dictionary-ID'
  | 'Digest'
  | 'DPoP'
  | 'DPoP-Nonce'
  | 'Early-Data'
  | 'EDIINT-Features'
  | 'ETag'
  | 'Expect'
  | 'Expect-CT'
  | 'Expires'
  | 'Ext'
  | 'Forwarded'
  | 'From'
  | 'GetProfile'
  | 'Hobareg'
  | 'Host'
  | 'HTTP2-Settings'
  | 'If'
  | 'If-Match'
  | 'If-Modified-Since'
  | 'If-None-Match'
  | 'If-Range'
  | 'If-Schedule-Tag-Match'
  | 'If-Unmodified-Since'
  | 'IM'
  | 'Include-Referred-Token-Binding-ID'
  | 'Isolation'
  | 'Keep-Alive'
  | 'Label'
  | 'Last-Event-ID'
  | 'Last-Modified'
  | 'Link'
  | 'Link-Template'
  | 'Location'
  | 'Lock-Token'
  | 'Man'
  | 'Max-Forwards'
  | 'Memento-Datetime'
  | 'Meter'
  | 'Method-Check'
  | 'Method-Check-Expires'
  | 'MIME-Version'
  | 'Negotiate'
  | 'NEL'
  | 'OData-EntityId'
  | 'OData-Isolation'
  | 'OData-MaxVersion'
  | 'OData-Version'
  | 'Opt'
  | 'Optional-WWW-Authenticate'
  | 'Ordering-Type'
  | 'Origin'
  | 'Origin-Agent-Cluster'
  | 'OSCORE'
  | 'OSLC-Core-Version'
  | 'Overwrite'
  | 'P3P'
  | 'PEP'
  | 'PEP-Info'
  | 'Permissions-Policy'
  | 'PICS-Label'
  | 'Ping-From'
  | 'Ping-To'
  | 'Position'
  | 'Pragma'
  | 'Prefer'
  | 'Preference-Applied'
  | 'Priority'
  | 'ProfileObject'
  | 'Protocol'
  | 'Protocol-Info'
  | 'Protocol-Query'
  | 'Protocol-Request'
  | 'Proxy-Authenticate'
  | 'Proxy-Authentication-Info'
  | 'Proxy-Authorization'
  | 'Proxy-Features'
  | 'Proxy-Instruction'
  | 'Proxy-Status'
  | 'Public'
  | 'Public-Key-Pins'
  | 'Public-Key-Pins-Report-Only'
  | 'Range'
  | 'Redirect-Ref'
  | 'Referer'
  | 'Referer-Root'
  | 'Referrer-Policy'
  | 'Refresh'
  | 'Repeatability-Client-ID'
  | 'Repeatability-First-Sent'
  | 'Repeatability-Request-ID'
  | 'Repeatability-Result'
  | 'Replay-Nonce'
  | 'Reporting-Endpoints'
  | 'Repr-Digest'
  | 'Retry-After'
  | 'Safe'
  | 'Schedule-Reply'
  | 'Schedule-Tag'
  | 'Sec-GPC'
  | 'Sec-Purpose'
  | 'Sec-Token-Binding'
  | 'Sec-WebSocket-Accept'
  | 'Sec-WebSocket-Extensions'
  | 'Sec-WebSocket-Key'
  | 'Sec-WebSocket-Protocol'
  | 'Sec-WebSocket-Version'
  | 'Security-Scheme'
  | 'Server'
  | 'Server-Timing'
  | 'Set-Cookie'
  | 'Set-Cookie2'
  | 'SetProfile'
  | 'Signature'
  | 'Signature-Input'
  | 'SLUG'
  | 'SoapAction'
  | 'Status-URI'
  | 'Strict-Transport-Security'
  | 'Sunset'
  | 'Surrogate-Capability'
  | 'Surrogate-Control'
  | 'TCN'
  | 'TE'
  | 'Timeout'
  | 'Timing-Allow-Origin'
  | 'Topic'
  | 'Traceparent'
  | 'Tracestate'
  | 'Trailer'
  | 'Transfer-Encoding'
  | 'TTL'
  | 'Upgrade'
  | 'Urgency'
  | 'URI'
  | 'Use-As-Dictionary'
  | 'User-Agent'
  | 'Variant-Vary'
  | 'Vary'
  | 'Via'
  | 'Want-Content-Digest'
  | 'Want-Digest'
  | 'Want-Repr-Digest'
  | 'Warning'
  | 'WWW-Authenticate'
  | 'X-Content-Type-Options'
  | 'X-Frame-Options';

export type ResponseHeader =
  | 'Access-Control-Allow-Credentials'
  | 'Access-Control-Allow-Headers'
  | 'Access-Control-Allow-Methods'
  | 'Access-Control-Allow-Origin'
  | 'Access-Control-Expose-Headers'
  | 'Access-Control-Max-Age'
  | 'Age'
  | 'Allow'
  | 'Cache-Control'
  | 'Clear-Site-Data'
  | 'Content-Disposition'
  | 'Content-Encoding'
  | 'Content-Language'
  | 'Content-Length'
  | 'Content-Location'
  | 'Content-Range'
  | 'Content-Security-Policy'
  | 'Content-Security-Policy-Report-Only'
  | 'Content-Type'
  | 'Cookie'
  | 'Cross-Origin-Embedder-Policy'
  | 'Cross-Origin-Opener-Policy'
  | 'Cross-Origin-Resource-Policy'
  | 'Date'
  | 'ETag'
  | 'Expires'
  | 'Last-Modified'
  | 'Location'
  | 'Permissions-Policy'
  | 'Pragma'
  | 'Retry-After'
  | 'Save-Data'
  | 'Sec-CH-Prefers-Color-Scheme'
  | 'Sec-CH-Prefers-Reduced-Motion'
  | 'Sec-CH-UA'
  | 'Sec-CH-UA-Arch'
  | 'Sec-CH-UA-Bitness'
  | 'Sec-CH-UA-Form-Factor'
  | 'Sec-CH-UA-Full-Version'
  | 'Sec-CH-UA-Full-Version-List'
  | 'Sec-CH-UA-Mobile'
  | 'Sec-CH-UA-Model'
  | 'Sec-CH-UA-Platform'
  | 'Sec-CH-UA-Platform-Version'
  | 'Sec-CH-UA-WoW64'
  | 'Sec-Fetch-Dest'
  | 'Sec-Fetch-Mode'
  | 'Sec-Fetch-Site'
  | 'Sec-Fetch-User'
  | 'Sec-GPC'
  | 'Server'
  | 'Server-Timing'
  | 'Service-Worker-Navigation-Preload'
  | 'Set-Cookie'
  | 'Strict-Transport-Security'
  | 'Timing-Allow-Origin'
  | 'Trailer'
  | 'Transfer-Encoding'
  | 'Upgrade'
  | 'Vary'
  | 'WWW-Authenticate'
  | 'Warning'
  | 'X-Content-Type-Options'
  | 'X-DNS-Prefetch-Control'
  | 'X-Frame-Options'
  | 'X-Permitted-Cross-Domain-Policies'
  | 'X-Powered-By'
  | 'X-Robots-Tag'
  | 'X-XSS-Protection';

export type AcceptHeader =
  | 'Accept'
  | 'Accept-Charset'
  | 'Accept-Encoding'
  | 'Accept-Language'
  | 'Accept-Patch'
  | 'Accept-Post'
  | 'Accept-Ranges';

// note: `X-${string}` is deprecated
export type CustomHeader = string & {};

/**
 * Common MIME types for Content-Type header
 */
export type BaseMime =
  | 'audio/aac'
  | 'video/x-msvideo'
  | 'image/avif'
  | 'video/av1'
  | 'application/octet-stream'
  | 'image/bmp'
  | 'text/css'
  | 'text/csv'
  | 'application/vnd.ms-fontobject'
  | 'application/epub+zip'
  | 'image/gif'
  | 'application/gzip'
  | 'text/html'
  | 'image/x-icon'
  | 'text/calendar'
  | 'image/jpeg'
  | 'text/javascript'
  | 'application/json'
  | 'application/ld+json'
  | 'audio/x-midi'
  | 'video/mp4'
  | 'video/mpeg'
  | 'audio/ogg'
  | 'video/ogg'
  | 'application/ogg'
  | 'audio/opus'
  | 'font/otf'
  | 'application/pdf'
  | 'image/png'
  | 'application/rtf'
  | 'image/svg+xml'
  | 'image/tiff'
  | 'video/mp2t'
  | 'font/ttf'
  | 'text/plain'
  | 'application/wasm'
  | 'video/webm'
  | 'audio/webm'
  | 'application/manifest+json'
  | 'image/webp'
  | 'font/woff'
  | 'font/woff2'
  | 'application/xhtml+xml'
  | 'application/xml'
  | 'application/zip'
  | 'video/3gpp'
  | 'video/3gpp2'
  | 'model/gltf+json'
  | 'model/gltf-binary'
  | 'application/json';
