import { createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';

/** AWS credentials, the shape the AWS SDK's credential providers resolve to */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** For temporary credentials (STS, instance roles, SSO) */
  sessionToken?: string;
}

export interface SigV4Request {
  method: string;
  /** The URL as it is sent: its host, path and query are signed */
  url: string | URL;
  /** Headers to sign and send. `host` is taken from the URL. */
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export interface SigV4Options {
  credentials: AwsCredentials;
  region: string;
  /** The signing name of the service, e.g. `ses` */
  service: string;
  /** Default: now */
  date?: Date;
}

export interface SigV4Signature {
  /** The request headers plus `x-amz-date`, `x-amz-security-token` (temporary credentials) and `authorization` */
  headers: Record<string, string>;
  authorization: string;
  signature: string;
  canonicalRequest: string;
  stringToSign: string;
}

/**
 * Signs a request with AWS Signature Version 4 (header form) on `node:crypto`,
 * as the AWS SDKs do for services other than S3: each path segment of the URL
 * is URI-encoded again, query parameters are encoded and sorted, header values
 * are trimmed with inner whitespace collapsed.
 *
 * `host` is signed from the URL but not returned: `fetch` sets it itself.
 */
export function signV4(
  request: SigV4Request,
  options: SigV4Options,
): SigV4Signature {
  const { credentials, region, service } = options;
  const url = new URL(request.url);
  const amzDate = (options.date ?? new Date())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    ...request.headers,
    'x-amz-date': amzDate,
  };
  if (credentials.sessionToken) {
    headers['x-amz-security-token'] = credentials.sessionToken;
  }
  const canonical = new Map<string, string>([['host', url.host]]);
  for (const [name, value] of Object.entries(headers)) {
    canonical.set(name.toLowerCase(), value.replace(/\s+/g, ' ').trim());
  }
  const names = [...canonical.keys()].sort();
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    request.method.toUpperCase(),
    url.pathname.split('/').map(uriEncode).join('/'),
    canonicalQuery(url),
    names.map((name) => `${name}:${canonical.get(name)}\n`).join(''),
    signedHeaders,
    sha256Hex(request.body ?? ''),
  ].join('\n');

  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const key = [day, region, service, 'aws4_request'].reduce<Buffer | string>(
    (k, part) => createHmac('sha256', k).update(part, 'utf8').digest(),
    `AWS4${credentials.secretAccessKey}`,
  );
  const signature = createHmac('sha256', key)
    .update(stringToSign, 'utf8')
    .digest('hex');
  const authorization = `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: { ...headers, authorization },
    authorization,
    signature,
    canonicalRequest,
    stringToSign,
  };
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** RFC 3986: unreserved characters stay, everything else is `%XX` of its UTF-8 bytes */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams]
    .map(([key, value]) => [uriEncode(key), uriEncode(value)])
    .sort(([ak, av], [bk, bv]) =>
      ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
