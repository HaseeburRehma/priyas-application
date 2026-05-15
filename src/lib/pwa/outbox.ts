/**
 * Client-side wrapper for the IndexedDB mutation outbox used by the
 * service worker. Keep the schema constants in lockstep with the matching
 * block in `public/sw.js`.
 *
 * All functions are guarded — calling them in an SSR / Node context (or
 * in a browser without IndexedDB) is a no-op that resolves to safe
 * defaults so callers don't need to feature-detect everywhere.
 */

const DB_NAME = "priya-pwa";
const STORE = "outbox";
const DB_VERSION = 1;

export type OutboxEntry = {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
  attemptCount: number;
  lastError: string | null;
  lastAttemptAt: number | null;
};

export type EnqueueInput = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function uuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID ===
      "function"
  ) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIdb()) {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const captured: { value: T | undefined } = { value: undefined };
      Promise.resolve(fn(store))
        .then((r) => {
          captured.value = r;
        })
        .catch(reject);
      tx.oncomplete = () => resolve(captured.value as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("idb tx aborted"));
    });
  } finally {
    db.close();
  }
}

/** Enqueue a mutation. Returns the persisted entry. No-op (returns null)
 *  when IndexedDB is unavailable — caller should fall back accordingly. */
export async function enqueue(input: EnqueueInput): Promise<OutboxEntry | null> {
  if (!hasIdb()) return null;
  const entry: OutboxEntry = {
    id: uuid(),
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body ?? "",
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  try {
    await withStore("readwrite", (store) => {
      store.add(entry);
    });
    return entry;
  } catch {
    return null;
  }
}

export async function list(): Promise<OutboxEntry[]> {
  if (!hasIdb()) return [];
  try {
    return await withStore<OutboxEntry[]>("readonly", (store) => {
      return new Promise<OutboxEntry[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as OutboxEntry[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return [];
  }
}

export async function count(): Promise<number> {
  if (!hasIdb()) return 0;
  try {
    return await withStore<number>("readonly", (store) => {
      return new Promise<number>((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result ?? 0);
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return 0;
  }
}

export async function markAttempt(id: string, error?: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result as OutboxEntry | undefined;
          if (!existing) {
            resolve();
            return;
          }
          const updated: OutboxEntry = {
            ...existing,
            attemptCount: existing.attemptCount + 1,
            lastError: error ?? null,
            lastAttemptAt: Date.now(),
          };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    });
  } catch {
    // Soft-fail.
  }
}

export async function remove(id: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      store.delete(id);
    });
  } catch {
    // Soft-fail.
  }
}

export async function clear(): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      store.clear();
    });
  } catch {
    // Soft-fail.
  }
}

// Re-export `remove` as `delete`-shaped helper without using the reserved word.
export { remove as deleteEntry };
