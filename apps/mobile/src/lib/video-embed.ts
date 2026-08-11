/**
 * Turn a bare YouTube / Vimeo URL into an `<iframe>`-friendly embed URL.
 * Same classifier the web app uses (src/lib/utils/video-embed.ts) so
 * training modules that play on one surface play on both.
 *
 * Returns:
 *   { kind: "embed", url }  → drop into <WebView source={{ uri: url }}>
 *   { kind: "direct", url } → for future <Video> playback of mp4/webm
 *   { kind: "invalid" }      → fall back to Linking.openURL(originalUrl)
 */

export type VideoEmbed =
  | { kind: "embed"; url: string }
  | { kind: "direct"; url: string }
  | { kind: "invalid" };

export function classifyVideoUrl(raw: string | null | undefined): VideoEmbed {
  if (!raw || typeof raw !== "string") return { kind: "invalid" };
  const url = raw.trim();
  if (!url) return { kind: "invalid" };

  // Direct video files — WebView can also play these, but a native
  // <Video> component is nicer if the caller wants it.
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(url)) {
    return { kind: "direct", url };
  }

  // YouTube — support youtu.be short links + watch?v= long links.
  const yt = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{6,})/i,
  );
  if (yt && yt[1]) {
    return {
      kind: "embed",
      url: `https://www.youtube.com/embed/${yt[1]}?playsinline=1&rel=0`,
    };
  }

  // Vimeo — normal video URL or player URL. IDs are digits only.
  const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vim && vim[1]) {
    return { kind: "embed", url: `https://player.vimeo.com/video/${vim[1]}` };
  }

  // Fall through — assume any other URL is embeddable if it starts with
  // http(s). If not, mark invalid so the caller can fall back to a
  // system-browser open.
  if (/^https?:\/\//i.test(url)) {
    return { kind: "embed", url };
  }
  return { kind: "invalid" };
}
