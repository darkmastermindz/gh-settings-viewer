import type { NextRequest } from 'next/server';
import { listRepos } from '../../../core/data/fetch-feature.ts';
import { isAccountKey } from '../../../core/security/validate.ts';
import { errorJson, handleError, json } from '../../../server/api.ts';
import { getRuntime } from '../../../server/runtime.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const owner = req.nextUrl.searchParams.get('owner');
    if (!isAccountKey(owner)) return errorJson(400, 'Invalid owner');
    const rt = await getRuntime();
    const caps = await rt.capabilities();
    const inst = rt.findInstallation(caps, 'repo', owner);
    if (!inst || !inst.features.some((id) => id.startsWith('repo-'))) return errorJson(404, 'No repository pages for this account');
    const repos = await listRepos(rt.readerFor(inst.id), req.nextUrl.searchParams.get('refresh') === '1');
    return json({ owner: inst.key, features: inst.features.filter((id) => id.startsWith('repo-')), repos });
  } catch (e) {
    return handleError(e);
  }
}
