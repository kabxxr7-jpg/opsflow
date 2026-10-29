// Shared by the upload form (client) and the intake action (server), so both enforce the same limits.

/** What the server will accept. Vercel's request-body ceiling for functions is 4.5 MB (multipart overhead included). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** What the browser shrinks a photo to before uploading — phone cameras produce 3–12 MB originals. */
export const TARGET_UPLOAD_BYTES = 1.5 * 1024 * 1024;
export const MAX_IMAGE_EDGE_PX = 2000;

export type ImageKind = "jpeg" | "png" | "webp";

/**
 * Identifies an image by its first bytes rather than trusting the filename or the client-supplied
 * Content-Type, both of which are just strings the sender chose.
 */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 //  WEBP
  ) {
    return "webp";
  }
  return null;
}
