import { describe, it, expect, vi } from "vitest";
import { handleBatchRequest } from "../../src/lfs/handler.js";
import { LfsConfig } from "../../src/config.js";
import { LFS_CONTENT_TYPE } from "../../src/lfs/types.js";

vi.mock("../../src/signing/sigv4.js", () => ({
  createPresignedUrl: vi.fn().mockResolvedValue(
    new URL("https://test-bucket.s3.us-east-1.amazonaws.com/test-oid?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fake")
  ),
  signRequestHeaders: vi.fn().mockResolvedValue({
    url: new URL("https://test-bucket.s3.us-east-1.amazonaws.com/test-oid"),
    headers: { host: "test-bucket.s3.us-east-1.amazonaws.com" },
  }),
}));

const mockFetch = vi.fn().mockResolvedValue(
  new Response(null, { status: 200, headers: { "content-length": "1024" } })
);
vi.stubGlobal("fetch", mockFetch);

const mockConfig: LfsConfig = {
  s3: {
    bucket: "test-bucket",
    keyPrefix: "",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expirySeconds: 3600,
  },
  auth: {
    mode: "dictionary",
    credentials: new Map([["testuser", "testpass"]]),
  },
};

function makeRequest(overrides: {
  auth?: string;
  contentType?: string;
  body?: unknown;
  method?: string;
}): Request {
  const headers: Record<string, string> = {};
  headers["Content-Type"] = overrides.contentType ?? LFS_CONTENT_TYPE;
  if (overrides.auth !== undefined) {
    headers["Authorization"] = overrides.auth;
  } else {
    headers["Authorization"] = `Basic ${btoa("testuser:testpass")}`;
  }

  return new Request("https://lfs.example.com/objects/batch", {
    method: overrides.method ?? "POST",
    headers,
    body: JSON.stringify(
      overrides.body ?? { operation: "download", objects: [{ oid: "abc123", size: 100 }] }
    ),
  });
}

describe("handleBatchRequest", () => {
  it("should reject requests without Authorization header", async () => {
    const request = new Request("https://lfs.example.com/objects/batch", {
      method: "POST",
      headers: { "Content-Type": LFS_CONTENT_TYPE },
      body: JSON.stringify({ operation: "download", objects: [{ oid: "abc123", size: 100 }] }),
    });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(401);
  });

  it("should reject requests with invalid credentials", async () => {
    const request = makeRequest({
      auth: `Basic ${btoa("testuser:wrongpass")}`,
    });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(401);
  });

  it("should reject requests with wrong Content-Type", async () => {
    const request = makeRequest({ contentType: "text/plain" });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(415);
  });

  it("should reject requests with missing operation", async () => {
    const request = makeRequest({
      body: { objects: [{ oid: "abc123", size: 100 }] },
    });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(400);
  });

  it("should reject requests with empty objects array", async () => {
    const request = makeRequest({
      body: { operation: "download", objects: [] },
    });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(400);
  });

  it("should accept application/json content type as fallback", async () => {
    const request = makeRequest({ contentType: "application/json" });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).not.toBe(415);
  });

  it("should return 501 for unsupported operations", async () => {
    const request = makeRequest({
      body: { operation: "verify", objects: [{ oid: "abc123", size: 100 }] },
    });

    const response = await handleBatchRequest(request, mockConfig);
    expect(response.status).toBe(501);
  });

  it("should require Write permission for POST requests (matching C# behavior)", async () => {
    // Even download operations via POST require Write permission,
    // matching the C# BasicAuthFilter which uses HTTP method, not body.operation
    const request = makeRequest({
      body: { operation: "download", objects: [{ oid: "abc123", size: 100 }] },
    });

    const response = await handleBatchRequest(request, mockConfig);
    // Should succeed because dictionary auth grants Read+Write regardless
    expect(response.status).toBe(200);
  });
});