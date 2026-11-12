import { Compare } from '../../components/Compare.tsx';
import { SetupNeeded } from '../../components/SetupNeeded.tsx';
import { registry } from '../../core/registry/index.ts';
import { publicCapabilities } from '../../server/api.ts';
import { loadContext } from '../../server/page-context.ts';

export const metadata = { title: 'Compare' };

export default async function ComparePage() {
  const ctx = await loadContext();
  if (!ctx.ok) return <SetupNeeded error={ctx.error} />;
  const caps = publicCapabilities(ctx.caps);
  const discovered = new Set(caps.installations.flatMap((i) => i.features));
  // Only discovered pages are offered; the component narrows further to pages every selected item has.
  const features = registry.filter((f) => discovered.has(f.id) && f.scope !== 'enterprise').map((f) => ({ id: f.id, label: f.label, section: f.section, scope: f.scope }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compare settings</h1>
      <p className="text-sm text-fg-muted">Diff the same page across organizations or repositories. Only pages available for every selected item are offered.</p>
      <Compare installations={caps.installations} features={features} />
    </div>
  );
}
