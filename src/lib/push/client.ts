/**
 * Browser-side helpers for Web Push. All functions are safe to call from
 * an SSR'd module — they no-op when `window` / `navigator` aren't there.
 */

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "default";
  }
  return Notification.permission;
}

/** Convert a base64url-encoded VAPID public key into the Uint8Array the
 * PushManager expects. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Returns the current subscription for this browser (may be null). */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await ensureServiceWorker();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Prompt for permission and create the subscription. Returns null if
 * the user denies, the browser doesn't support push, or VAPID isn't
 * configured. */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  if (!isPushSupported() || !vapidPublicKey) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await ensureServiceWorker();
  if (!reg) return null;
  // The `applicationServerKey` accepts BufferSource | string. We feed it
  // the underlying ArrayBuffer to satisfy the type checker across all
  // lib.dom.d.ts versions.
  const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes.buffer as ArrayBuffer,
  });
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return false;
  return sub.unsubscribe();
}
