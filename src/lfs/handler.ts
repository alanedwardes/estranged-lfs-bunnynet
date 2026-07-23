import { LfsConfig } from "../config.js";
import { DictionaryAuthenticator } from "../auth/dictionary.js";
import { GitHubAuthenticator } from "../auth/github.js";
import { S3BlobAdapter } from "../storage/s3.js";
import { Authenticator } from "../auth/types.js";
import { uploadObjects, downloadObjects } from "./object-manager.js";
import { BatchRequest, LfsPermission, LFS_CONTENT_TYPE } from "./types.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": LFS_CONTENT_TYPE },
  });
}

function decodeBasicAuth(header: string): [string, string] {
  const encoded = header.substring(6);
  const decoded = atob(encoded);
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) {
    throw new Error("Invalid Basic auth format");
  }
  return [decoded.substring(0, colonIndex), decoded.substring(colonIndex + 1)];
}

export async function handleBatchRequest(
  request: Request,
  config: LfsConfig
): Promise<Response> {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes(LFS_CONTENT_TYPE) && !contentType.includes("application/json")) {
    return jsonResponse(415, {
      message: "Unsupported Content-Type. Expected application/vnd.git-lfs+json",
    });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return jsonResponse(401, { message: "Authentication required" });
  }

  let username: string;
  let password: string;
  try {
    [username, password] = decodeBasicAuth(authHeader);
  } catch {
    return jsonResponse(401, { message: "Invalid Authorization header" });
  }

  let body: BatchRequest;
  try {
    body = (await request.json()) as BatchRequest;
  } catch {
    return jsonResponse(400, { message: "Invalid JSON body" });
  }

  if (!body.operation || !body.objects || body.objects.length === 0) {
    return jsonResponse(400, { message: "Missing 'operation' or 'objects' in request" });
  }

  // All batch API requests are POST, so always require Write permission
  // (matches C# BasicAuthFilter which uses HTTP method, not body.operation)
  const requiredPermission = LfsPermission.Write;

  const authenticator: Authenticator = config.auth.mode === "dictionary"
    ? new DictionaryAuthenticator(config.auth.credentials)
    : new GitHubAuthenticator(config.auth);

  try {
    await authenticator.authenticate(username, password, requiredPermission);
  } catch {
    return jsonResponse(401, { message: "Authentication failed" });
  }

  const blobAdapter = new S3BlobAdapter(config.s3);

  let responseObjects;
  try {
    if (body.operation === "upload") {
      responseObjects = await uploadObjects(body.objects, blobAdapter);
    } else if (body.operation === "download") {
      responseObjects = await downloadObjects(body.objects, blobAdapter);
    } else {
      return jsonResponse(501, { message: `Operation not supported: ${body.operation}` });
    }
  } catch {
    return jsonResponse(500, { message: "Internal server error" });
  }

  return jsonResponse(200, {
    transfer: body.transfers?.[0] || "basic",
    objects: responseObjects,
  });
}