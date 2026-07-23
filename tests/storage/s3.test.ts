import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { S3BlobAdapter } from "../../src/storage/s3.js";

vi.mock("../../src/signing/sigv4.js", () => ({
  createPresignedUrl: vi.fn(),
  signRequestHeaders: vi.fn(),
}));

import { createPresignedUrl, signRequestHeaders } from "../../src/signing/sigv4.js";

const mockConfig = {
  bucket: "test-bucket",
  keyPrefix: "lfs/",
  region: "us-east-1",
  accessKeyId: "AKID",
  secretAccessKey: "SECRET",
  expirySeconds: 3600,
};

const originalFetch = globalThis.fetch;

describe("S3BlobAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("signUpload", () => {
    it("should generate a presigned PUT URL with Content-Type header", async () => {
      const mockUrl = new URL(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/abc123?X-Amz-Algorithm=AWS4-HMAC-SHA256"
      );
      vi.mocked(createPresignedUrl).mockResolvedValueOnce(mockUrl);

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signUpload("abc123", 1024);

      expect(createPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "PUT",
          bucket: "test-bucket",
          key: "lfs/abc123",
          contentType: "application/octet-stream",
          expires: 3600,
        })
      );

      expect(result.uri).toBe(mockUrl.toString());
      expect(result.headers["Content-Type"]).toBe("application/octet-stream");
      expect(result.expirySeconds).toBe(3600);
    });

    it("should use key prefix when building the key", async () => {
      const mockUrl = new URL(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/oid123"
      );
      vi.mocked(createPresignedUrl).mockResolvedValueOnce(mockUrl);

      const adapter = new S3BlobAdapter(mockConfig);
      await adapter.signUpload("oid123", 2048);

      expect(createPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "lfs/oid123",
        })
      );
    });
  });

  describe("signDownload", () => {
    it("should return error when object does not exist (404)", async () => {
      vi.mocked(signRequestHeaders).mockResolvedValueOnce({
        url: new URL("https://test-bucket.s3.us-east-1.amazonaws.com/lfs/missing"),
        headers: { host: "test-bucket.s3.us-east-1.amazonaws.com" },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(null, { status: 404, statusText: "Not Found" })
      );

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("missing");

      expect(result.errorCode).toBe(404);
      expect(result.errorMessage).toBeTruthy();
      expect(result.uri).toBeUndefined();
      expect(createPresignedUrl).not.toHaveBeenCalled();
    });

    it("should return presigned URL and size when object exists", async () => {
      vi.mocked(signRequestHeaders).mockResolvedValueOnce({
        url: new URL("https://test-bucket.s3.us-east-1.amazonaws.com/lfs/existing"),
        headers: { host: "test-bucket.s3.us-east-1.amazonaws.com" },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "content-length": "2048" },
        })
      );

      const mockUrl = new URL(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/existing?X-Amz-Algorithm=AWS4-HMAC-SHA256"
      );
      vi.mocked(createPresignedUrl).mockResolvedValueOnce(mockUrl);

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("existing");

      expect(result.uri).toBe(mockUrl.toString());
      expect(result.size).toBe(2048);
      expect(result.errorCode).toBeUndefined();
    });

    it("should handle network errors gracefully", async () => {
      vi.mocked(signRequestHeaders).mockResolvedValueOnce({
        url: new URL("https://test-bucket.s3.us-east-1.amazonaws.com/lfs/network-error"),
        headers: { host: "test-bucket.s3.us-east-1.amazonaws.com" },
      });

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const mockUrl = new URL(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/network-error?X-Amz-Algorithm=AWS4-HMAC-SHA256"
      );
      vi.mocked(createPresignedUrl).mockResolvedValueOnce(mockUrl);

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("network-error");

      expect(result.uri).toBe(mockUrl.toString());
      expect(result.errorCode).toBeUndefined();
    });
  });
});