// What the browser may know about discovery: no tokens, no permissions detail, no probe internals.
// Pure (no Next.js imports) so tests can check it directly.
import type { Capabilities, DiscoveredInstallation } from '../core/discovery/discover.ts';

export function publicInstallation(i: DiscoveredInstallation) {
  return { id: i.id, key: i.key, scope: i.scope, features: i.features };
}

export function publicCapabilities(caps: Capabilities) {
  return {
    app: { name: caps.app.name, slug: caps.app.slug, owner: caps.app.owner?.login },
    discoveredAt: caps.discoveredAt,
    installations: caps.installations.filter((i) => !i.suspended).map(publicInstallation),
  };
}
