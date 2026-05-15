// Service worker for Priya's Reinigungsservice.
// Responsibilities:
//   1. Web Push notifications (push + notificationclick) — pre-existing.
//   2. App-shell precache + runtime caching strategies for offline support.
//   3. Mutation outbox replay via Background Sync.
//
// Plain ES (no modules / no TS) — runs verbatim in the browser.

const CACHE_NAME = "priya-shell-v1";
const RUNTIME_API_CACHE = "priya-api-swr-v1";
const RUNTIME_STATIC_CACHE = "priya-static-v1";

// App shell: minimal set we want available offline. Anything missing during
// install is logged but doesn't break the install (`addAll` would).
const SHELL_ASSETS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// IndexedDB for the mutation outbox. Mirrored from src/lib/pwa/outbox.ts.
const OUTBOX_DB = "priya-pwa";
const OUTBOX_STORE = "outbox";
const OUTBOX_DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Tolerate individual failures — addAll() is all-or-nothing.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[sw] precache miss", url, err && err.message);
          }),
        ),
      );
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_NAME, RUNTIME_API_CACHE, RUNTIME_STATIC_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Fetch handler — routing table
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = safeUrl(request.url);
  if (!url) return; // Let the browser handle weird schemes.

  // Same-origin only. Cross-origin → default network.
  if (url.origin !== self.location.origin) return;

  // 1) Navigation: network-first, fallback to cached /offline.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // 2) /api/v1/* → pass-through (no caching).
  if (url.pathname.startsWith("/api/v1/")) {
    if (request.method !== "GET") {
      event.respondWith(handleMutation(request));
      return;
    }
    return; // Default network fetch.
  }

  // 3) /api/* GET → stale-while-revalidate. Non-GET → enqueue on failure.
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET") {
      event.respondWith(staleWhileRevalidate(request));
      return;
    }
    event.respondWith(handleMutation(request));
    return;
  }

  // 4) Static assets — cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 5) Other same-origin non-GET — try network, queue if offline.
  if (request.method !== "GET") {
    event.respondWith(handleMutation(request));
  }
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    // Opportunistically refresh the shell entry.
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match("/offline");
    if (offline) return offline;
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><title>Offline</title><body style=\"font-family:system-ui;padding:2rem\"><h1>Offline</h1><p>This app is offline and no cached page is available.</p></body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_API_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (cached) {
    // Refresh in background.
    networkPromise.catch(() => {});
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch (_err) {
    // Last-ditch: try the shell cache (manifest is there).
    const shell = await caches.open(CACHE_NAME);
    const shellHit = await shell.match(request);
    if (shellHit) return shellHit;
    return new Response("", { status: 504 });
  }
}

async function handleMutation(request) {
  // Try network first — only enqueue on actual network failure.
  try {
    return await fetch(request.clone());
  } catch (_err) {
    try {
      await enqueueRequest(request);
      // Best-effort: register a sync, broadcast a tick.
      try {
        if (self.registration && self.registration.sync) {
          await self.registration.sync.register("replay-outbox");
        }
      } catch (_e) {
        /* sync API unsupported — replay() will run manually */
      }
      await broadcastProgress({ type: "outbox-progress", phase: "queued" });
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ queued: false, error: String(e && e.message ? e.message : e) }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Outbox (IndexedDB) — mirrored shape with src/lib/pwa/outbox.ts
// ---------------------------------------------------------------------------

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb open failed"));
  });
}

function txStore(db, mode) {
  const tx = db.transaction(OUTBOX_STORE, mode);
  return { tx, store: tx.objectStore(OUTBOX_STORE) };
}

function uuid() {
  if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function enqueueRequest(request) {
  const db = await openOutboxDb();
  const headers = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  // Body must be captured BEFORE the request is consumed elsewhere.
  let body = "";
  try {
    body = await request.clone().text();
  } catch (_e) {
    body = "";
  }
  const entry = {
    id: uuid(),
    method: request.method,
    url: request.url,
    headers,
    body,
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  await new Promise((resolve, reject) => {
    const { tx, store } = txStore(db, "readwrite");
    store.add(entry);
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return entry;
}

async function listOutbox() {
  const db = await openOutboxDb();
  const items = await new Promise((resolve, reject) => {
    const { store } = txStore(db, "readonly");
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return items;
}

async function deleteOutbox(id) {
  const db = await openOutboxDb();
  await new Promise((resolve, reject) => {
    const { tx, store } = txStore(db, "readwrite");
    store.delete(id);
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function updateOutbox(entry) {
  const db = await openOutboxDb();
  await new Promise((resolve, reject) => {
    const { tx, store } = txStore(db, "readwrite");
    store.put(entry);
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ---------------------------------------------------------------------------
// Sync — drain the outbox.
// ---------------------------------------------------------------------------

self.addEventListener("sync", (event) => {
  if (event.tag === "replay-outbox") {
    event.waitUntil(replayOutbox());
  }
});

async function replayOutbox() {
  let items;
  try {
    items = await listOutbox();
  } catch (e) {
    await broadcastProgress({
      type: "outbox-progress",
      phase: "error",
      error: String(e && e.message ? e.message : e),
    });
    return;
  }
  if (!items.length) {
    await broadcastProgress({ type: "outbox-progress", phase: "idle", remaining: 0 });
    return;
  }
  await broadcastProgress({
    type: "outbox-progress",
    phase: "start",
    total: items.length,
  });
  let processed = 0;
  let remaining = items.length;
  for (const entry of items) {
    let res = null;
    let lastError = null;
    try {
      res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers || {},
        body: entry.method === "GET" || entry.method === "HEAD" ? undefined : entry.body,
        credentials: "include",
      });
    } catch (e) {
      lastError = String(e && e.message ? e.message : e);
    }
    if (res && res.ok) {
      try {
        await deleteOutbox(entry.id);
      } catch (_e) {
        /* ignore */
      }
      remaining -= 1;
    } else {
      const updated = {
        ...entry,
        attemptCount: (entry.attemptCount || 0) + 1,
        lastError: lastError || (res ? `HTTP ${res.status}` : "unknown"),
        lastAttemptAt: Date.now(),
      };
      try {
        await updateOutbox(updated);
      } catch (_e) {
        /* ignore */
      }
    }
    processed += 1;
    await broadcastProgress({
      type: "outbox-progress",
      phase: "progress",
      processed,
      total: items.length,
      remaining,
    });
  }
  await broadcastProgress({
    type: "outbox-progress",
    phase: "done",
    remaining,
  });
}

// ---------------------------------------------------------------------------
// Client messaging — manual replay trigger.
// ---------------------------------------------------------------------------

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "replay") {
    event.waitUntil(replayOutbox());
  } else if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

async function broadcastProgress(payload) {
  try {
    const all = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of all) {
      try {
        client.postMessage(payload);
      } catch (_e) {
        /* ignore */
      }
    }
  } catch (_e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeUrl(href) {
  try {
    return new URL(href);
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Web Push (pre-existing behaviour preserved)
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = {
    title: "Priya's Reinigungsservice",
    body: "",
    url: "/",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (_e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const client of all) {
        if (client.url.endsWith(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    }),
  );
});
