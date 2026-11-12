import { getRuntime } from '../../../server/runtime.ts';
import { handleError, json, publicCapabilities } from '../../../server/api.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rt = await getRuntime();
    return json(publicCapabilities(await rt.capabilities()));
  } catch (e) {
    return handleError(e);
  }
}
