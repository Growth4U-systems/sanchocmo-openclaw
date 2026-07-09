import { uploadToR2 } from "@/lib/upload-r2";

export async function uploadImageAssets(
  buffer: Buffer,
  key: string,
  contentType = "image/*",
) {
  return uploadToR2(buffer, key, contentType);
}
