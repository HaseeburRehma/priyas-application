"use client";

import { useEffect } from "react";

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/**
 * Registers `/sw.js` once on window `load`. Also re-registers a
 * background sync on the "replay-outbox" tag whenever the browser
 * comes back online — so queued mutations get drained promptly without
 * waiting for the next time the SW happens to wake.
 *
 * Fails soft on every unsupported surface (Safari iOS lacks Background
 * Sync; private windows may lack ServiceWorker entirely).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      // eslint-disable-next-line no-console
      console.info("[pwa] service workers unsupported in this browser");
      return;
    }

    // Dev-mode opt-out. In `next dev` the build hashes change on every
    // file edit, and a cached SW can hand the browser a stale chunk
    // URL that no longer exists on disk — surfacing as the runtime
    // error "Cannot read properties of undefined (reading 'call')" or
    // "Cannot find module ./xxx.js". Looks like a code bug but is
    // pure cache staleness. We also actively *unregister* any
    // previously-installed SW so a developer who built the prod
    // bundle once doesn't keep getting served from it forever.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) {
          // eslint-disable-next-line no-console
          console.info("[pwa] unregistering SW in dev mode:", r.scope);
          void r.unregister();
        }
      });
      return;
    }

    let cancelled = false;
    let cachedRegistration: SyncCapableRegistration | null = null;

    async function register(): Promise<SyncCapableRegistration | null> {
      try {
        const reg = (await navigator.serviceWorker.register(
          "/sw.js",
        )) as SyncCapableRegistration;
        if (!cancelled) cachedRegistration = reg;
        return reg;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[pwa] sw registration failed", err);
        return null;
      }
    }

    async function requestReplay(): Promise<void> {
      const reg = cachedRegistration ?? (await register());
      if (!reg) return;
      try {
        if (reg.sync) {
          await reg.sync.register("replay-outbox");
          return;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.info("[pwa] background sync unavailable, falling back", err);
      }
      // Fallback: ask the active SW to replay immediately.
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl) ctrl.postMessage({ type: "replay" });
    }

    function onLoad() {
      void register().then(() => {
        // If we're already online and have a queue, kick it off now.
        if (navigator.onLine) void requestReplay();
      });
    }

    function onOnline() {
      void requestReplay();
    }

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
