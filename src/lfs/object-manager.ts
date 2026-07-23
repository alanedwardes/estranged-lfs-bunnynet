import { BlobAdapter } from "../storage/types.js";
import { RequestObject, ResponseObject, Actions } from "./types.js";

export async function uploadObjects(
  objects: RequestObject[],
  blobAdapter: BlobAdapter
): Promise<ResponseObject[]> {
  const results = await Promise.all(
    objects.map(async (obj) => {
      const signedBlob = await blobAdapter.signUpload(obj.oid, obj.size);

      const actions: Actions = {
        upload: {
          href: signedBlob.uri!,
          expires_in: signedBlob.expirySeconds,
          header: signedBlob.headers,
        },
      };

      return {
        oid: obj.oid,
        size: obj.size,
        authenticated: true,
        actions,
      };
    })
  );

  return results;
}

export async function downloadObjects(
  objects: RequestObject[],
  blobAdapter: BlobAdapter
): Promise<ResponseObject[]> {
  const results = await Promise.all(
    objects.map(async (obj) => {
      const signedBlob = await blobAdapter.signDownload(obj.oid);

      if (signedBlob.errorCode) {
        return {
          oid: obj.oid,
          size: obj.size,
          authenticated: null,
          error: {
            code: signedBlob.errorCode,
            message: signedBlob.errorMessage || `Object not found: ${obj.oid}`,
          },
        };
      }

      const actions: Actions = {
        download: {
          href: signedBlob.uri!,
          expires_in: signedBlob.expirySeconds,
          header: signedBlob.headers,
        },
      };

      return {
        oid: obj.oid,
        size: signedBlob.size ?? obj.size,
        authenticated: true,
        actions,
      };
    })
  );

  return results;
}