import { AwsClient } from "aws4fetch";
import { BlobAdapter, SignedBlob } from "./types.js";
import { S3Config } from "../config.js";

export class S3BlobAdapter implements BlobAdapter {
  private readonly client: AwsClient;

  constructor(private config: S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
    });
  }

  async signUpload(oid: string, _size: number): Promise<SignedBlob> {
    const uri = await this.presign("PUT", this.buildKey(oid), {
      "Content-Type": "application/octet-stream",
    });

    return {
      uri,
      expirySeconds: this.config.expirySeconds,
      headers: { "Content-Type": "application/octet-stream" },
    };
  }

  async signDownload(oid: string): Promise<SignedBlob> {
    const key = this.buildKey(oid);

    let headResponse: Response;
    try {
      headResponse = await this.client.fetch(this.objectUrl(key), { method: "HEAD" });
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
    const uri = await this.presign("GET", this.buildKey(oid));

    const blob: SignedBlob = { uri, expirySeconds: this.config.expirySeconds, headers: {} };
    if (size !== undefined) {
      blob.size = size;
    }

    return blob;
  }

  private async presign(
    method: "GET" | "PUT",
    key: string,
    headers?: Record<string, string>
  ): Promise<string> {
    const url = this.objectUrl(key);
    url.searchParams.set("X-Amz-Expires", this.config.expirySeconds.toString());

    const signed = await this.client.sign(url, {
      method,
      headers,
      aws: { signQuery: true },
    });

    const signedUrl = new URL(signed.url);
    if (this.config.cloudFrontDomain) {
      signedUrl.host = this.config.cloudFrontDomain;
    }

    return signedUrl.toString();
  }

  private objectUrl(key: string): URL {
    const endpoint =
      this.config.endpoint || `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
    return new URL(`${endpoint}/${key}`);
  }

  private buildKey(oid: string): string {
    return `${this.config.keyPrefix}${oid}`;
  }
}
