"use client";

import { useEffect, useRef, useState } from "react";

// Module-level cache so multiple hook instances share one offset and don't
// each independently re-fetch /api/now on mount.
let cachedOffset = 0;
let inflight: Promise<number> | null = null;
let lastFetch = 0;

async function measureOffset(): Promise<number> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const before = Date.now();
      const res = await fetch("/api/now", { cache: "no-store" });
      const after = Date.now();
      const data: { now: number } = await res.json();
      // Assume the server's `now` was measured roughly in the middle of the
      // round trip — gives us the best client-clock-aligned estimate.
      const rtt = after - before;
      const serverNowOnClient = data.now + rtt / 2;
      cachedOffset = Math.round(serverNowOnClient - after);
      lastFetch = after;
      return cachedOffset;
    } catch {
      return cachedOffset;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hook that returns a server-time offset (ms) the caller adds to `Date.now()`
 * to get a clock that matches the server (and therefore matches the TV and
 * every other client) regardless of local device clock drift.
 *
 * Usage:
 *   const offset = useServerTimeOffset();
 *   const now = Date.now() + offset;       // "synced" wall-clock time
 *   const remaining = endsAt - now;        // matches other devices
 *
 * Refreshes itself every 5 minutes in case the device clock slowly drifts.
 */
export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(cachedOffset);
  // Track whether component is mounted to avoid setting state after unmount.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Refresh on mount if we've never measured or if it's been >5min.
    const stale = !lastFetch || Date.now() - lastFetch > 5 * 60_000;
    if (stale) {
      measureOffset().then((o) => {
        if (aliveRef.current) setOffset(o);
      });
    } else if (offset !== cachedOffset) {
      setOffset(cachedOffset);
    }
    // Re-measure periodically.
    const t = setInterval(() => {
      measureOffset().then((o) => {
        if (aliveRef.current) setOffset(o);
      });
    }, 5 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return offset;
}
