import { getRuntime } from '../../../../server/runtime.ts';
import { handleError, json, publicCapabilities } from '../../../../server/api.ts';

export const dynamic = 'force-dynamic';

/** "Refresh capabilities": re-runs discovery so new permissions or installations appear without a restart. */
export async function POST() {
  try {
    const rt = await getRuntime();
    return json(publicCapabilities(await rt.capabilities(true)));
  } catch (e) {
    return handleError(e);
  }
}
