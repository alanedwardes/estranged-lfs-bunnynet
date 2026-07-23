import { BlobAdapter, SignedBlob } from "./types.js";
import { S3Config } from "../config.js";
import { createPresignedUrl, signRequestHeaders } from "../signing/sigv4.js";

export class S3BlobAdapter implements BlobAdapter {
  constructor(private config: S3Config) {}

  async signUpload(oid: string, _size: number): Promise<SignedBlob> {
    const key = this.buildKey(oid);
    const url = await createPresignedUrl({
      method: "PUT",
      bucket: this.config.bucket,
      key,
      region: this.config.region,
      endpoint: this.config.endpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      contentType: "application/octet-stream",
      expires: this.config.expirySeconds,
      cloudFrontDomain: this.config.cloudFrontDomain,
    });

    return {
      uri: url.toString(),
      expirySeconds: this.config.expirySeconds,
      headers: { "Content-Type": "application/octet-stream" },
    };
  }

  async signDownload(oid: string): Promise<SignedBlob> {
    const key = this.buildKey(oid);

    const { url: headUrl, headers: headHeaders } = await signRequestHeaders({
      method: "HEAD",
      bucket: this.config.bucket,
      key,
      region: this.config.region,
      endpoint: this.config.endpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
    });

    let headResponse: Response;
    try {
      headResponse = await fetch(headUrl.toString(), {
        method: "HEAD",
        headers: headHeaders,
      });
    } catch {
      // Network error — still return a URL, let the client deal with it
      return this.createDownloadUrl(oid, undefined);
    }

    if (!headResponse.ok) {
      return {
        uri: undefined,
        expirySeconds: this.config.expirySeconds,
        headers: {},
        errorCode: headResponse.status,
        errorMessage: headResponse.statusText || `Object not found: ${oid}`,
      };
    }

    const contentLength = parseInt(
      headResponse.headers.get("content-length") || "0",
      10
    );

    return this.createDownloadUrl(oid, contentLength);
  }

  private async createDownloadUrl(oid: string, size: number | undefined): Promise<SignedBlob> {
    const key = this.buildKey(oid);
    const url = await createPresignedUrl({
      method: "GET",
      bucket: this.config.bucket,
      key,
      region: this.config.region,
      endpoint: this.config.endpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expires: this.config.expirySeconds,
      cloudFrontDomain: this.config.cloudFrontDomain,
    });

    const blob: SignedBlob = {
      uri: url.toString(),
      expirySeconds: this.config.expirySeconds,
      headers: {},
    };

    if (size !== undefined) {
      blob.size = size;
    }

    return blob;
  }

  private buildKey(oid: string): string {
    return `${this.config.keyPrefix}${oid}`;
  }
}