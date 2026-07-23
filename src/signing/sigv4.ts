/**
 * AWS Signature Version 4 for S3 presigned URLs and request signing.
 * Uses the Web Crypto API (crypto.subtle) — no AWS SDK dependency.
 */

const SERVICE = "s3";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

// Cache signing keys per (date, region, service) — keyed by derived hash, not raw secret
const signingKeyCache = new Map<string, ArrayBuffer>();
const MAX_CACHE_SIZE = 64;

function getCacheKey(date: string, region: string, service: string): string {
  return `${date}:${region}:${service}`;
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key,
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  return bufToHex(await hmacSha256(key, message));
}

async function sha256Hex(data: string): Promise<string> {
  return bufToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getDateStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").slice(0, 8);
}

function getAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const cacheKey = getCacheKey(date, region, service);
  const cached = signingKeyCache.get(cacheKey);
  if (cached) return cached;

  const kSecret = new TextEncoder().encode(`AWS4${secretKey}`);
  const kDate = await hmacSha256(kSecret.buffer, date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");

  if (signingKeyCache.size >= MAX_CACHE_SIZE) {
    const oldest = signingKeyCache.keys().next().value;
    if (oldest) signingKeyCache.delete(oldest);
  }
  signingKeyCache.set(cacheKey, kSigning);
  return kSigning;
}

interface PresignOptions {
  method: "GET" | "PUT" | "HEAD";
  bucket: string;
  key: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType?: string;
  expires: number;
  cloudFrontDomain?: string;
}

export async function createPresignedUrl(opts: PresignOptions): Promise<URL> {
  const date = new Date();
  const dateStamp = getDateStamp(date);
  const amzDate = getAmzDate(date);
  const credentialScope = `${dateStamp}/${opts.region}/${SERVICE}/aws4_request`;

  const endpoint = opts.endpoint || `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  const url = new URL(`${endpoint}/${opts.key}`);

  const signedHeaders: string[] = ["host"];
  const headersToSign: Record<string, string> = { host: url.host };

  if (opts.contentType) {
    signedHeaders.push("content-type");
    headersToSign["content-type"] = opts.contentType;
  }

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${opts.accessKeyId}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", opts.expires.toString());
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders.join(";"));

  const sortedParams = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalHeaders = signedHeaders
    .map((h) => `${h}:${headersToSign[h]}`)
    .join("\n") + "\n";

  const canonicalRequest = [
    opts.method, `/${opts.key}`, sortedParams,
    canonicalHeaders, signedHeaders.join(";"), UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(opts.secretAccessKey, dateStamp, opts.region, SERVICE);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  url.searchParams.set("X-Amz-Signature", signature);

  if (opts.cloudFrontDomain) {
    url.host = opts.cloudFrontDomain;
  }

  return url;
}

interface SignHeadersOptions {
  method: "GET" | "PUT" | "HEAD";
  bucket: string;
  key: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  additionalHeaders?: Record<string, string>;
}

export async function signRequestHeaders(opts: SignHeadersOptions): Promise<{ url: URL; headers: Record<string, string> }> {
  const date = new Date();
  const dateStamp = getDateStamp(date);
  const amzDate = getAmzDate(date);
  const credentialScope = `${dateStamp}/${opts.region}/${SERVICE}/aws4_request`;

  const endpoint = opts.endpoint || `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  const url = new URL(`${endpoint}/${opts.key}`);

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": UNSIGNED_PAYLOAD,
    ...opts.additionalHeaders,
  };

  const signedHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .join(";");

  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .sort(([a], [b]) => a.localeCompare(b))
    .join("\n") + "\n";

  const canonicalRequest = [
    opts.method, `/${opts.key}`, "",
    canonicalHeaders, signedHeaders, UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(opts.secretAccessKey, dateStamp, opts.region, SERVICE);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url, headers };
}