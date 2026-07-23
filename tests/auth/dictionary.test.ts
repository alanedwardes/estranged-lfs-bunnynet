import { describe, it, expect } from "vitest";
import { DictionaryAuthenticator } from "../../src/auth/dictionary.js";
import { LfsPermission } from "../../src/lfs/types.js";

describe("DictionaryAuthenticator", () => {
  const credentials = new Map([
    ["alice", "password123"],
    ["bob", "hunter2"],
  ]);
  const authenticator = new DictionaryAuthenticator(credentials);

  it("should authenticate with valid credentials", async () => {
    await expect(
      authenticator.authenticate("alice", "password123", LfsPermission.Read)
    ).resolves.toBeUndefined();

    await expect(
      authenticator.authenticate("bob", "hunter2", LfsPermission.Write)
    ).resolves.toBeUndefined();
  });

  it("should reject invalid password", async () => {
    await expect(
      authenticator.authenticate("alice", "wrongpassword", LfsPermission.Read)
    ).rejects.toThrow("Invalid password");
  });

  it("should reject unknown username", async () => {
    await expect(
      authenticator.authenticate("unknown", "password123", LfsPermission.Read)
    ).rejects.toThrow("Unknown user");
  });

  it("should grant both Read and Write permissions regardless of requiredPermission", async () => {
    // Dictionary auth always grants Read+Write
    await expect(
      authenticator.authenticate("alice", "password123", LfsPermission.Read)
    ).resolves.toBeUndefined();

    await expect(
      authenticator.authenticate("alice", "password123", LfsPermission.Write)
    ).resolves.toBeUndefined();

    await expect(
      authenticator.authenticate("alice", "password123", LfsPermission.Read | LfsPermission.Write)
    ).resolves.toBeUndefined();
  });
});