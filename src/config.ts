export interface S3Config {
  bucket: string;
  keyPrefix: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  expirySeconds: number;
  cloudFrontDomain?: string;
}

export interface DictionaryAuthConfig {
  mode: "dictionary";
  credentials: Map<string, string>;
}

export interface GitHubAuthConfig {
  mode: "github";
  organisation: string;
  repository: string;
  apiBase: string;
}

export type AuthConfig = DictionaryAuthConfig | GitHubAuthConfig;

export interface LfsConfig {
  s3: S3Config;
  auth: AuthConfig;
}

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(key);
  }
  return process.env[key];
}

function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = getEnv(key);
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable ${key}: ${value}`);
  }
  return parsed;
}

export function loadConfig(): LfsConfig {
  const s3: S3Config = {
    bucket: requireEnv("LFS_BUCKET"),
    keyPrefix: getEnv("LFS_S3_KEY_PREFIX") ?? "",
    region: getEnv("LFS_S3_REGION") ?? "us-east-1",
    endpoint: getEnv("LFS_S3_ENDPOINT"),
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    expirySeconds: getEnvInt("LFS_S3_EXPIRY_SECONDS", 3600),
    cloudFrontDomain: getEnv("LFS_CLOUDFRONT_DOMAIN") || undefined,
  };

  const credentials = new Map<string, string>();

  const username = getEnv("LFS_USERNAME");
  const password = getEnv("LFS_PASSWORD");
  if (username && password) {
    credentials.set(username, password);
  }

  const credentialsJson = getEnv("LFS_CREDENTIALS");
  if (credentialsJson) {
    try {
      const parsed = JSON.parse(credentialsJson) as Record<string, string>;
      for (const [user, pass] of Object.entries(parsed)) {
        credentials.set(user, pass);
      }
    } catch {
      throw new Error("Invalid JSON in LFS_CREDENTIALS environment variable");
    }
  }

  const isDictionaryAuth = credentials.size > 0;

  const gitHubOrganisation = getEnv("GITHUB_ORGANISATION");
  const gitHubRepository = getEnv("GITHUB_REPOSITORY");
  const isGitHubAuth = !!gitHubOrganisation && !!gitHubRepository;

  if ([isDictionaryAuth, isGitHubAuth].filter(Boolean).length !== 1) {
    throw new Error(
      "Unable to detect authentication mechanism. Please set LFS_USERNAME and LFS_PASSWORD " +
        "(or LFS_CREDENTIALS) for simple user/password auth, or GITHUB_ORGANISATION and " +
        "GITHUB_REPOSITORY for authentication against that repository on GitHub"
    );
  }

  const auth: AuthConfig = isDictionaryAuth
    ? { mode: "dictionary", credentials }
    : {
        mode: "github",
        organisation: gitHubOrganisation!,
        repository: gitHubRepository!,
        apiBase: getEnv("GITHUB_API_BASE") ?? "https://api.github.com/",
      };

  return { s3, auth };
}