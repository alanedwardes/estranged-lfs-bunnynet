export interface SignedBlob {
  uri: string | undefined;
  size?: number;
  expirySeconds: number;
  headers: Record<string, string>;
  errorCode?: number;
  errorMessage?: string;
}

export interface BlobAdapter {
  signUpload(oid: string, size: number): Promise<SignedBlob>;
  signDownload(oid: string): Promise<SignedBlob>;
}