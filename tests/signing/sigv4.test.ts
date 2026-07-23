import { describe, it, expect, vi } from "vitest";
import { createPresignedUrl, signRequestHeaders } from "../../src/signing/sigv4.js";

// AWS SigV4 test vectors from:
// https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
// We use the example from the AWS documentation for GET request to:
// GET /?Param2=value2&Param1=value1
// Host: examplebucket.s3.amazonaws.com
// X-Amz-Date: 20130524T000000Z

describe("createPresignedUrl", () => {
  const opts = {
    method: "GET" as const,
    bucket: "examplebucket",
    key: "test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expires: 86400,
  };

  it("should generate a valid presigned URL with required parameters", async () => {
    const url = await createPresignedUrl(opts);

    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("us-east-1");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("s3");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("aws4_request");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Date")).toBeTruthy();
  });

  it("should use the correct S3 host format", async () => {
    const url = await createPresignedUrl(opts);
    expect(url.hostname).toBe("examplebucket.s3.us-east-1.amazonaws.com");
    expect(url.pathname).toBe("/test.txt");
  });

  it("should include content-type in signed headers for PUT", async () => {
    const putUrl = await createPresignedUrl({
      ...opts,
      method: "PUT",
      contentType: "application/octet-stream",
    });

    const signedHeaders = putUrl.searchParams.get("X-Amz-SignedHeaders");
    expect(signedHeaders).toContain("content-type");
    expect(signedHeaders).toContain("host");
  });

  it("should only sign host header for GET (no content-type)", async () => {
    const getUrl = await createPresignedUrl(opts);
    const signedHeaders = getUrl.searchParams.get("X-Amz-SignedHeaders");
    expect(signedHeaders).toBe("host");
  });

  it("should apply CloudFront domain swap after signing", async () => {
    const url = await createPresignedUrl({
      ...opts,
      cloudFrontDomain: "d1234.cloudfront.net",
    });

    expect(url.hostname).toBe("d1234.cloudfront.net");
  });

  it("should use custom endpoint when provided", async () => {
    const url = await createPresignedUrl({
      ...opts,
      endpoint: "https://minio.example.com",
    });

    expect(url.hostname).toBe("minio.example.com");
    // Key should still be in the path
    expect(url.pathname).toBe("/test.txt");
  });

  it("should use default expiry of 3600 if specified", async () => {
    const url = await createPresignedUrl({
      ...opts,
      expires: 3600,
    });

    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  });

  it("should include key prefix in the path", async () => {
    const url = await createPresignedUrl({
      ...opts,
      key: "prefix/test.txt",
    });

    expect(url.pathname).toBe("/prefix/test.txt");
  });

  it("should produce deterministic signatures for same inputs", async () => {
    // Mock Date to get deterministic results
    const fixedDate = new Date("2024-01-15T10:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);

    const url1 = await createPresignedUrl(opts);
    const url2 = await createPresignedUrl(opts);

    expect(url1.searchParams.get("X-Amz-Signature")).toBe(
      url2.searchParams.get("X-Amz-Signature")
    );

    vi.useRealTimers();
  });
});

describe("signRequestHeaders", () => {
  const opts = {
    method: "HEAD" as const,
    bucket: "examplebucket",
    key: "test.txt",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };

  it("should return an Authorization header", async () => {
    const { headers } = await signRequestHeaders(opts);

    expect(headers["Authorization"]).toBeTruthy();
    expect(headers["Authorization"]).toContain("AWS4-HMAC-SHA256");
    expect(headers["Authorization"]).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(headers["Authorization"]).toContain("SignedHeaders=");
    expect(headers["Authorization"]).toContain("Signature=");
  });

  it("should include x-amz-date and x-amz-content-sha256 headers", async () => {
    const { headers } = await signRequestHeaders(opts);

    expect(headers["x-amz-date"]).toBeTruthy();
    expect(headers["x-amz-content-sha256"]).toBe("UNSIGNED-PAYLOAD");
    expect(headers["host"]).toBeTruthy();
  });

  it("should include additional headers in signing", async () => {
    const { headers } = await signRequestHeaders({
      ...opts,
      additionalHeaders: { "content-type": "application/octet-stream" },
    });

    expect(headers["content-type"]).toBe("application/octet-stream");
    expect(headers["Authorization"]).toContain("content-type");
  });

  it("should use the correct S3 URL", async () => {
    const { url } = await signRequestHeaders(opts);

    expect(url.hostname).toBe("examplebucket.s3.us-east-1.amazonaws.com");
    expect(url.pathname).toBe("/test.txt");
  });

  it("should use custom endpoint when provided", async () => {
    const { url } = await signRequestHeaders({
      ...opts,
      endpoint: "https://minio.example.com",
    });

    expect(url.hostname).toBe("minio.example.com");
  });
});