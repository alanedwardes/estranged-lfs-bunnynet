import { LfsPermission } from "../lfs/types.js";
import { AuthError, Authenticator } from "./types.js";

export class DictionaryAuthenticator implements Authenticator {
  constructor(private credentials: Map<string, string>) {}

  async authenticate(
    username: string,
    password: string,
    _requiredPermission: LfsPermission
  ): Promise<void> {
    const expectedPassword = this.credentials.get(username);
    if (expectedPassword === undefined) {
      throw new AuthError(`Unknown user: ${username}`);
    }
    if (expectedPassword !== password) {
      throw new AuthError("Invalid password");
    }
  }
}