import { LfsPermission } from "../lfs/types.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface Authenticator {
  authenticate(
    username: string,
    password: string,
    requiredPermission: LfsPermission
  ): Promise<void>;
}