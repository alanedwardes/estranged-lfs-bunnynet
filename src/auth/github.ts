import { LfsPermission } from "../lfs/types.js";
import { AuthError, Authenticator } from "./types.js";
import { GitHubAuthConfig } from "../config.js";

export class GitHubAuthenticator implements Authenticator {
  constructor(private config: GitHubAuthConfig) {}

  async authenticate(
    username: string,
    password: string,
    requiredPermission: LfsPermission
  ): Promise<void> {
    const url = `${this.config.apiBase}repos/${this.config.organisation}/${this.config.repository}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          "User-Agent": "Estranged.Lfs.EdgeScript",
          Accept: "application/vnd.github.v3+json",
        },
      });
    } catch (e) {
      throw new AuthError(`GitHub API request failed: ${(e as Error).message}`);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthError("Invalid GitHub credentials");
      }
      throw new AuthError(`GitHub API returned ${response.status}`);
    }

    const repo = (await response.json()) as {
      permissions?: { pull?: boolean; push?: boolean };
    };

    let actualPermission = LfsPermission.None;
    if (repo.permissions?.pull) actualPermission |= LfsPermission.Read;
    if (repo.permissions?.push) actualPermission |= LfsPermission.Write;

    if ((actualPermission & requiredPermission) !== requiredPermission) {
      throw new AuthError(
        `User ${username} does not have the required permission`
      );
    }
  }
}