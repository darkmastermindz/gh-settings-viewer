'use client';
import { useEffect, useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Registers the service worker (static shell only) and shows a clear offline state. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  if (online) return null;
  return (
    <div role="status" className="border-b border-warn bg-subtle px-4 py-2 text-sm text-warn">
      You&apos;re offline. Settings are read live from GitHub and are never stored for offline use; reconnect to load pages.
    </div>
  );
}
