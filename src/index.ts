import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { loadConfig } from "./config.js";
import { handleBatchRequest } from "./lfs/handler.js";
import { LFS_CONTENT_TYPE } from "./lfs/types.js";

const config = loadConfig();

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/objects/batch") {
    return handleBatchRequest(request, config);
  }

  // Locks are not implemented — matches C# behavior
  if (request.method === "POST" && url.pathname === "/locks/verify") {
    return new Response(null, { status: 404 });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "Not found" }), {
    status: 404,
    headers: { "Content-Type": LFS_CONTENT_TYPE },
  });
});