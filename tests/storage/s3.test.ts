import { describe, it, expect, vi, beforeEach } from "vitest";

const signMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("aws4fetch", () => ({
  AwsClient: vi.fn().mockImplementation(() => ({
    sign: signMock,
    fetch: fetchMock,
  })),
}));

const { S3BlobAdapter } = await import("../../src/storage/s3.js");

const mockConfig = {
  bucket: "test-bucket",
  keyPrefix: "lfs/",
  region: "us-east-1",
  accessKeyId: "AKID",
  secretAccessKey: "SECRET",
  expirySeconds: 3600,
};

describe("S3BlobAdapter", () => {
  beforeEach(() => {
    signMock.mockReset();
    fetchMock.mockReset();
  });

  describe("signUpload", () => {
    it("should generate a presigned PUT URL with Content-Type header", async () => {
      signMock.mockResolvedValueOnce({
        url: "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/abc123?X-Amz-Signature=abc",
      });

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signUpload("abc123", 1024);

      expect(signMock).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          aws: { signQuery: true },
        })
      );

      const [calledUrl] = signMock.mock.calls[0];
      expect(calledUrl.pathname).toBe("/lfs/abc123");
      expect(calledUrl.searchParams.get("X-Amz-Expires")).toBe("3600");

      expect(result.uri).toBe(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/abc123?X-Amz-Signature=abc"
      );
      expect(result.headers["Content-Type"]).toBe("application/octet-stream");
      expect(result.expirySeconds).toBe(3600);
    });

    it("should use key prefix when building the key", async () => {
      signMock.mockResolvedValueOnce({
        url: "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/oid123",
      });

      const adapter = new S3BlobAdapter(mockConfig);
      await adapter.signUpload("oid123", 2048);

      const [calledUrl] = signMock.mock.calls[0];
      expect(calledUrl.pathname).toBe("/lfs/oid123");
    });

    it("should swap in the CloudFront domain when configured", async () => {
      signMock.mockResolvedValueOnce({
        url: "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/abc123?X-Amz-Signature=abc",
      });

      const adapter = new S3BlobAdapter({ ...mockConfig, cloudFrontDomain: "d1234.cloudfront.net" });
      const result = await adapter.signUpload("abc123", 1024);

      expect(new URL(result.uri!).hostname).toBe("d1234.cloudfront.net");
    });
  });

  describe("signDownload", () => {
    it("should return error when object does not exist (404)", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404, statusText: "Not Found" }));

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("missing");

      expect(result.errorCode).toBe(404);
      expect(result.errorMessage).toBeTruthy();
      expect(result.uri).toBeUndefined();
      expect(signMock).not.toHaveBeenCalled();
    });

    it("should return presigned URL and size when object exists", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { "content-length": "2048" } })
      );
      signMock.mockResolvedValueOnce({
        url: "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/existing?X-Amz-Signature=abc",
      });

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("existing");

      expect(result.uri).toBe(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/existing?X-Amz-Signature=abc"
      );
      expect(result.size).toBe(2048);
      expect(result.errorCode).toBeUndefined();
    });

    it("should handle network errors gracefully", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      signMock.mockResolvedValueOnce({
        url: "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/network-error?X-Amz-Signature=abc",
      });

      const adapter = new S3BlobAdapter(mockConfig);
      const result = await adapter.signDownload("network-error");

      expect(result.uri).toBe(
        "https://test-bucket.s3.us-east-1.amazonaws.com/lfs/network-error?X-Amz-Signature=abc"
      );
      expect(result.errorCode).toBeUndefined();
    });
  });
});
