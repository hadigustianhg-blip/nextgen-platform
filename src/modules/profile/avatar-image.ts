import sharp from "sharp";
import { ProfileError } from "./profile.error";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_DIMENSION = 4096;
export const AVATAR_OUTPUT_SIZE = 512;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedFormats = new Set(["jpeg", "png", "webp"]);

export async function normalizeAvatarImage(file: File) {
  if (!allowedMimeTypes.has(file.type)) throw new ProfileError("AVATAR_TYPE_INVALID", 400);
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new ProfileError("AVATAR_SIZE_INVALID", 400);

  const input = new Uint8Array(await file.arrayBuffer());
  try {
    const decoder = sharp(input, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION,
    });
    const metadata = await decoder.metadata();
    if (!metadata.format || !allowedFormats.has(metadata.format)) throw new ProfileError("AVATAR_TYPE_INVALID", 400);
    if ((metadata.pages ?? 1) > 1) throw new ProfileError("AVATAR_ANIMATED_NOT_ALLOWED", 400);
    if (!metadata.width || !metadata.height || metadata.width > MAX_AVATAR_DIMENSION || metadata.height > MAX_AVATAR_DIMENSION) {
      throw new ProfileError("AVATAR_DIMENSIONS_INVALID", 400);
    }
    return await sharp(input, { failOn: "warning" })
      .rotate()
      .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError("AVATAR_IMAGE_INVALID", 400);
  }
}
