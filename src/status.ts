/**
 * Enum-style object representing all HTTP status codes.
 *
 * Includes:
 * - Success (2xx)
 * - Redirect (3xx)
 * - Informational (1xx)
 * - Client Error (4xx)
 * - Server Error (5xx)
 *
 * @publicApi http-status
 */
export const HttpStatus = Object.freeze({
  // 1xx
  CONTINUE: 100,
  '100_NAME': 'Continue',
  SWITCHING_PROTOCOLS: 101,
  '101_NAME': 'Switching Protocols',
  PROCESSING: 102,
  '102_NAME': 'Processing',
  EARLY_HINTS: 103,
  '103_NAME': 'Early Hints',
  // 2xx
  OK: 200,
  '200_NAME': 'OK',
  CREATED: 201,
  '201_NAME': 'Created',
  ACCEPTED: 202,
  '202_NAME': 'Accepted',
  NON_AUTHORITATIVE_INFORMATION: 203,
  '203_NAME': 'Non-Authoritative Information',
  NO_CONTENT: 204,
  '204_NAME': 'No Content',
  RESET_CONTENT: 205,
  '205_NAME': 'Reset Content',
  PARTIAL_CONTENT: 206,
  '206_NAME': 'Partial Content',
  MULTI_STATUS: 207,
  '207_NAME': 'Multi-Status',
  ALREADY_REPORTED: 208,
  '208_NAME': 'Already Reported',
  IM_USED: 226,
  '226_NAME': 'IM Used',
  // 3xx
  MULTIPLE_CHOICES: 300,
  '300_NAME': 'Multiple Choices',
  MOVED_PERMANENTLY: 301,
  '301_NAME': 'Moved Permanently',
  FOUND: 302,
  '302_NAME': 'Found',
  SEE_OTHER: 303,
  '303_NAME': 'See Other',
  NOT_MODIFIED: 304,
  '304_NAME': 'Not Modified',
  USE_PROXY: 305,
  '305_NAME': 'Use Proxy',
  UNUSED: 306,
  '306_NAME': 'Unused',
  TEMPORARY_REDIRECT: 307,
  '307_NAME': 'Temporary Redirect',
  PERMANENT_REDIRECT: 308,
  '308_NAME': 'Permanent Redirect',
  // 4xx
  BAD_REQUEST: 400,
  '400_NAME': 'Bad Request',
  UNAUTHORIZED: 401,
  '401_NAME': 'Unauthorized',
  PAYMENT_REQUIRED: 402,
  '402_NAME': 'Payment Required',
  FORBIDDEN: 403,
  '403_NAME': 'Forbidden',
  NOT_FOUND: 404,
  '404_NAME': 'Not Found',
  METHOD_NOT_ALLOWED: 405,
  '405_NAME': 'Method Not Allowed',
  NOT_ACCEPTABLE: 406,
  '406_NAME': 'Not Acceptable',
  PROXY_AUTHENTICATION_REQUIRED: 407,
  '407_NAME': 'Proxy Authentication Required',
  REQUEST_TIMEOUT: 408,
  '408_NAME': 'Request Timeout',
  CONFLICT: 409,
  '409_NAME': 'Conflict',
  GONE: 410,
  '410_NAME': 'Gone',
  LENGTH_REQUIRED: 411,
  '411_NAME': 'Length Required',
  PRECONDITION_FAILED: 412,
  '412_NAME': 'Precondition Failed',
  PAYLOAD_TOO_LARGE: 413,
  '413_NAME': 'Payload Too Large',
  URI_TOO_LONG: 414,
  '414_NAME': 'URI Too Long',
  UNSUPPORTED_MEDIA_TYPE: 415,
  '415_NAME': 'Unsupported Media Type',
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  '416_NAME': 'Range Not Satisfiable',
  EXPECTATION_FAILED: 417,
  '417_NAME': 'Expectation Failed',
  IM_A_TEAPOT: 418,
  '418_NAME': "I'm a Teapot",
  MISDIRECTED_REQUEST: 421,
  '421_NAME': 'Misdirected Request',
  UNPROCESSABLE_ENTITY: 422,
  '422_NAME': 'Unprocessable Entity',
  LOCKED: 423,
  '423_NAME': 'Locked',
  FAILED_DEPENDENCY: 424,
  '424_NAME': 'Failed Dependency',
  TOO_EARLY: 425,
  '425_NAME': 'Too Early',
  UPGRADE_REQUIRED: 426,
  '426_NAME': 'Upgrade Required',
  PRECONDITION_REQUIRED: 428,
  '428_NAME': 'Precondition Required',
  TOO_MANY_REQUESTS: 429,
  '429_NAME': 'Too Many Requests',
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  '431_NAME': 'Request Header Fields Too Large',
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  '451_NAME': 'Unavailable For Legal Reasons',
  // 5xx
  INTERNAL_SERVER_ERROR: 500,
  '500_NAME': 'Internal Server Error',
  NOT_IMPLEMENTED: 501,
  '501_NAME': 'Not Implemented',
  BAD_GATEWAY: 502,
  '502_NAME': 'Bad Gateway',
  SERVICE_UNAVAILABLE: 503,
  '503_NAME': 'Service Unavailable',
  GATEWAY_TIMEOUT: 504,
  '504_NAME': 'Gateway Timeout',
  HTTP_VERSION_NOT_SUPPORTED: 505,
  '505_NAME': 'HTTP Version Not Supported',
  VARIANT_ALSO_NEGOTIATES: 506,
  '506_NAME': 'Variant Also Negotiates',
  INSUFFICIENT_STORAGE: 507,
  '507_NAME': 'Insufficient Storage',
  LOOP_DETECTED: 508,
  '508_NAME': 'Loop Detected',
  BANDWIDTH_LIMIT_EXCEEDED: 509,
  '509_NAME': 'Bandwidth Limit Exceeded',
  NOT_EXTENDED: 510,
  '510_NAME': 'Not Extended',
  NETWORK_AUTHENTICATION_REQUIRED: 511,
  '511_NAME': 'Network Authentication Required',
});

/**
 * Extracts the union of all value types of a given object type.
 *
 * @example
 * ```ts
 * type Example = { a: 1; b: 'x'; c: true };
 * type Values = ValueOf<Example>; // 1 | 'x' | true
 * ```
 */
type ValueOf<T> = T[keyof T];

/**
 * Extracts numeric status codes from {@link HttpStatus}.
 */
export type HttpStatusCode = Extract<ValueOf<typeof HttpStatus>, number>;

/**
 * @module
 * HTTP Status Utility Types
 */

/** Informational & Success (1xx–2xx) */
export type SuccessStatusCode =
  | 100
  | 101
  | 102
  | 103
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 226;
/** Redirect (3xx) */
export type RedirectStatusCode =
  | 300
  | 301
  | 302
  | 303
  | 304
  | 305
  | 306
  | 307
  | 308;
/** Server Error (5xx) */
export type ServerErrorStatusCode =
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 509
  | 510
  | 511;
/**
 * Client Error (4xx)
 *
 * Automatically derived by excluding all known 1xx, 2xx, 3xx, and 5xx codes.
 */
export type ClientErrorStatusCode = Exclude<
  HttpStatusCode,
  SuccessStatusCode | RedirectStatusCode | ServerErrorStatusCode | -1
>;
