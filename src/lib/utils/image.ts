/**
 * Client-side image compression. Spec §4.5 calls for "automatic
 * compression" on assignment-documentation photos so a field-staff
 * member can upload 20 images on a metered mobile connection without
 * spending their day waiting on the upload.
 *
 * Strategy:
 *   • Skip non-images (we only handle JPEG/PNG/WEBP).
 *   • Decode via Image + Canvas in the browser.
 *   • Cap longest edge at maxEdge px (default 1920) — high enough for any
 *     normal documentation use, low enough to slash file size on phone
 *     pictures (which are routinely 4000px+).
 *   • Re-encode as JPEG at 0.82 quality. JPEG is universally supported
 *     and produces ~150–400 KB per image at 1920 px.
 *
 * Failures fall back to the original File so we never block an upload
 * just because compression couldn't run (Safari on lockdown mode, weird
 * EXIF, etc.).
 */
export async function compressImage(
  file: File,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  const { maxEdge = 1920, quality = 0.82 } = options;

  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  // SVG / GIF are passed through. SVG compression is meaningless;
  // GIF would need frame-by-frame work we don't want to do client-side.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  // Tiny files aren't worth the round-trip.
  if (file.size < 200_000) return file;

  try {
    const bitmap = await createImageBitmapSafe(file);
    if (!bitmap) return file;

    const { width, height } = bitmap;
    const longest = Math.max(width, height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    // Skip the swap if we somehow ended up larger.
    if (blob.size >= file.size) return file;

    const renamed = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], renamed, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/**
 * createImageBitmap exists everywhere we care about (Chrome/Safari/Edge
 * 90+) but Safari < 17 needs a `decode()` fallback for animated WebP.
 * Wrap defensively.
 */
async function createImageBitmapSafe(
  file: File,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Render via canvas instead of returning ImageBitmap — caller is
      // happy with anything that has width/height + drawImage support.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve(img as any);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Spec §4.5 — "Up to 20 photos per assignment". Returns the trimmed
 * list and a count of how many incoming items were dropped because
 * they would have pushed the total over the cap.
 *
 * `existing` and `incoming` can be different types — we only count the
 * length of `existing` and slice `incoming`, so this is generic over
 * incoming only.
 */
export const MAX_PHOTOS_PER_ASSIGNMENT = 20;
export function enforcePhotoCap<T>(
  existing: ReadonlyArray<unknown>,
  incoming: T[],
  cap = MAX_PHOTOS_PER_ASSIGNMENT,
): { kept: T[]; dropped: number } {
  const room = Math.max(0, cap - existing.length);
  if (incoming.length <= room) {
    return { kept: incoming, dropped: 0 };
  }
  return {
    kept: incoming.slice(0, room),
    dropped: incoming.length - room,
  };
}
