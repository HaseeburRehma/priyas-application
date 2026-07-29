/**
 * Video-URL classification + embed-URL rewriting.
 *
 * A training/onboarding module's `video_url` can be one of:
 *   1. A direct file URL — Supabase Storage public URL, or any URL
 *      ending in .mp4/.webm/.mov/.ogg. Render with `<video src>`.
 *   2. A share URL from YouTube or Vimeo — rewrite to the embed URL
 *      and render with `<iframe>`. `<video>` cannot play those.
 *   3. Something else — treat as unplayable; UI should show a clear
 *      "video not available" state instead of a broken empty player.
 *
 * Kept in one file so the Training Hub (admin) and Onboarding page
 * (field staff) never diverge. Both consumed the same value from the
 * DB and both need to make the same rendering decision.
 */

const DIRECT_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|#|$)/i;

/**
 * True when the URL resolves to a raw video file the browser can
 * decode with a `<video>` tag. Supabase Storage public URLs are
 * always direct, so we treat any `/storage/v1/object/` URL as such
 * even if the extension is missing.
 */
export function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  if (DIRECT_EXT.test(url)) return true;
  if (url.includes("/storage/v1/object/")) return true;
  return false;
}

/**
 * Convert a share URL to an embeddable URL for `<iframe>` playback.
 * Returns `null` if we can't recognise the host — caller then falls
 * back to the "unplayable" UI.
 *
 * Supported hosts:
 *   - YouTube (`youtube.com/watch?v=…`, `youtu.be/…`, existing `/embed/`)
 *   - Vimeo (`vimeo.com/<id>`, existing `player.vimeo.com/video/…`)
 *   - Loom (`loom.com/share/<id>`)
 */
export function toEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // YouTube
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      // Already an embed link — leave it alone.
      if (u.pathname.startsWith("/embed/")) return url;
      // Short link: https://youtu.be/<id>
      if (host === "youtu.be") {
        const id = u.pathname.replace(/^\//, "").split("/")[0];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      // Long link: https://www.youtube.com/watch?v=<id>
      const id =
        u.searchParams.get("v") ??
        u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://www.youtube.com/embed/${id}`;
    }

    // Vimeo
    if (host.includes("vimeo.com")) {
      if (host === "player.vimeo.com") return url;
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }

    // Loom
    if (host.includes("loom.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("share");
      const id = idx >= 0 ? parts[idx + 1] : parts.pop();
      if (id) return `https://www.loom.com/embed/${id}`;
    }
  } catch {
    // Not a valid URL; fall through and return null.
  }
  return null;
}

export type VideoKind = "direct" | "embed" | "invalid";

/** Single classification call — returns the render decision + the URL to use. */
export function classifyVideoUrl(
  url: string | null,
): { kind: "direct"; src: string } | { kind: "embed"; src: string } | { kind: "invalid" } {
  if (!url) return { kind: "invalid" };
  if (isDirectVideoUrl(url)) return { kind: "direct", src: url };
  const embed = toEmbedUrl(url);
  if (embed) return { kind: "embed", src: embed };
  return { kind: "invalid" };
}
