// Browser-only helpers for the photo-intake form. Kept apart from lib/image.ts, which is also
// imported by the server action and must not touch DOM APIs.
import { MAX_IMAGE_EDGE_PX, TARGET_UPLOAD_BYTES } from "@/lib/image";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Phone cameras produce 3–12 MB originals, which would blow through the request-size limit long
 * before OCR ever sees them — and OCR gains nothing from the extra pixels. So anything large is
 * redrawn at <= 2000px on its longest side and re-encoded as JPEG until it fits.
 *
 * If the browser can't decode the file (HEIC outside Safari, say), the original is returned
 * untouched and the server gives the verdict, with a message the person can act on.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= TARGET_UPLOAD_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    const name = `${file.name.replace(/\.[^.]+$/, "") || "upload"}.jpg`;

    let last: Blob | null = null;
    for (const quality of [0.85, 0.7, 0.55]) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#fff"; // JPEG has no alpha; transparent PNGs would otherwise turn black
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) return file;
      last = blob;
      if (blob.size <= TARGET_UPLOAD_BYTES) break;
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    return last ? new File([last], name, { type: "image/jpeg" }) : file;
  } finally {
    bitmap.close();
  }
}
