import { getRuntime } from '../../../server/runtime.ts';
import { handleError, json } from '../../../server/api.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rt = await getRuntime();
    const caps = await rt.capabilities();
    return json({ app: caps.app, installations: rt.diagnostics(caps), probes: caps.probes, discoveredAt: caps.discoveredAt });
  } catch (e) {
    return handleError(e);
  }
}
