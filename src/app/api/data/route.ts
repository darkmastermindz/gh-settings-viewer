import type { NextRequest } from 'next/server';
import { fetchFeature } from '../../../core/data/fetch-feature.ts';
import { cleanFilter } from '../../../core/security/validate.ts';
import { errorJson, handleError, json } from '../../../server/api.ts';
import { resolveTarget } from '../../../server/resolve-target.ts';
import { getRuntime } from '../../../server/runtime.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const rt = await getRuntime();
    const r = await resolveTarget(rt, { scope: q.get('scope'), key: q.get('key'), repo: q.get('repo') ?? undefined, feature: q.get('feature') });
    if (!r.ok) return errorJson(r.status, r.message);
    const data = await fetchFeature(rt.readerFor(r.inst.id), r.feature, r.inst, r.target, r.repo, { refresh: q.get('refresh') === '1', filter: cleanFilter(q.get('filter')) });
    return json(data);
  } catch (e) {
    return handleError(e);
  }
}
