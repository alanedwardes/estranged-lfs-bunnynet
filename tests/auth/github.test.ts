import { describe, it, expect, vi } from "vitest";
import { GitHubAuthenticator } from "../../src/auth/github.js";
import { LfsPermission } from "../../src/lfs/types.js";

describe("GitHubAuthenticator", () => {
  const config = {
    organisation: "EstrangedGame",
    repository: "Iterum",
    apiBase: "https://api.github.com/",
  };

  it("should authenticate a user with push permission for write operations", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        permissions: { pull: true, push: true },
      }),
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const authenticator = new GitHubAuthenticator(config);
    await authenticator.authenticate("user", "pass", LfsPermission.Write);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/EstrangedGame/Iterum",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Basic"),
        }),
      })
    );

    fetchSpy.mockRestore();
  });

  it("should authenticate a user with pull permission for read operations", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        permissions: { pull: true, push: false },
      }),
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const authenticator = new GitHubAuthenticator(config);
    await authenticator.authenticate("readonly", "pass", LfsPermission.Read);

    fetchSpy.mockRestore();
  });

  it("should reject a user without push permission for write operations", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        permissions: { pull: true, push: false },
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const authenticator = new GitHubAuthenticator(config);
    await expect(
      authenticator.authenticate("readonly", "pass", LfsPermission.Write)
    ).rejects.toThrow("does not have the required permission");

    vi.restoreAllMocks();
  });

  it("should reject invalid credentials (401)", async () => {
    const mockResponse = { ok: false, status: 401 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const authenticator = new GitHubAuthenticator(config);
    await expect(
      authenticator.authenticate("bad", "creds", LfsPermission.Read)
    ).rejects.toThrow("Invalid GitHub credentials");

    vi.restoreAllMocks();
  });

  it("should handle network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    const authenticator = new GitHubAuthenticator(config);
    await expect(
      authenticator.authenticate("user", "pass", LfsPermission.Read)
    ).rejects.toThrow("GitHub API request failed");

    vi.restoreAllMocks();
  });

  it("should use custom API base URL", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ permissions: { pull: true, push: true } }),
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const customConfig = { ...config, apiBase: "https://github.example.com/api/v3/" };
    const authenticator = new GitHubAuthenticator(customConfig);
    await authenticator.authenticate("user", "pass", LfsPermission.Read);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://github.example.com/api/v3/repos/EstrangedGame/Iterum",
      expect.anything()
    );

    fetchSpy.mockRestore();
  });
});