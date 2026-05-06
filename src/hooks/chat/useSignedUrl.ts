"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Resolve a signed URL for a private Storage object. Returns null while
 * pending. Cached in module-level memory so repeated mounts of the same
 * bubble don't re-sign on every render.
 *
 * Default TTL is 30 minutes — well past any reasonable scroll session.
 */
const CACHE = new Map<string, { url: string; expiresAt: number }>();

export function useSignedUrl(
  bucket: string,
  path: string | null,
  ttlSeconds = 60 * 30,
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    const cached = CACHE.get(`${bucket}/${path}`);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    return null;
  });

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    const key = `${bucket}/${path}`;
    const cached = CACHE.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds)
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.signedUrl) {
          CACHE.set(key, {
            url: data.signedUrl,
            expiresAt: Date.now() + (ttlSeconds - 30) * 1000,
          });
          setUrl(data.signedUrl);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, ttlSeconds]);

  return url;
}
