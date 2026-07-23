export enum LfsPermission {
  None = 0,
  Read = 1,
  Write = 2,
}

export interface BatchRequest {
  operation: string;
  transfers?: string[];
  objects: RequestObject[];
  hash_algo?: string;
}

export interface RequestObject {
  oid: string;
  size: number;
}

export interface BatchResponse {
  transfer?: string;
  objects: ResponseObject[];
  hash_algo?: string;
}

export interface ResponseObject {
  oid: string;
  size: number;
  authenticated?: boolean | null;
  actions?: Actions;
  error?: ResponseObjectError;
}

export interface Actions {
  upload?: Action;
  download?: Action;
}

export interface Action {
  href: string;
  header?: Record<string, string>;
  expires_in?: number;
  expires_at?: string;
}

export interface ResponseObjectError {
  code: number;
  message: string;
}

export const LFS_CONTENT_TYPE = "application/vnd.git-lfs+json";