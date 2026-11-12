import type { NextRequest } from 'next/server';
import { fetchFeature } from '../../../core/data/fetch-feature.ts';
import { tabulate, toCsv } from '../../../core/data/shape.ts';
import { targetLabel } from '../../../core/data/types.ts';
import { redactDeep } from '../../../core/security/redact.ts';
import { cleanFilter } from '../../../core/security/validate.ts';
import { download, errorJson, handleError } from '../../../server/api.ts';
import { resolveTarget } from '../../../server/resolve-target.ts';
import { getRuntime } from '../../../server/runtime.ts';

export const dynamic = 'force-dynamic';

/** Export a page as JSON (all sections, raw) or CSV (one table, sections stacked). */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const format = q.get('format') === 'csv' ? 'csv' : 'json';
    const rt = await getRuntime();
    const r = await resolveTarget(rt, { scope: q.get('scope'), key: q.get('key'), repo: q.get('repo') ?? undefined, feature: q.get('feature') });
    if (!r.ok) return errorJson(r.status, r.message);
    const data = redactDeep(await fetchFeature(rt.readerFor(r.inst.id), r.feature, r.inst, r.target, r.repo, { filter: cleanFilter(q.get('filter')) }));
    const base = `${targetLabel(r.target).replace('/', '_')}-${r.feature.id}`;
    if (format === 'json') {
      const body = { page: r.feature.label, target: data.target, exportedAt: new Date().toISOString(), sections: data.sections.map((s) => ({ title: s.title, endpoint: s.endpoint, fetchedAt: s.fetchedAt, error: s.error, data: s.data })) };
      return download(JSON.stringify(body, null, 2), `${base}.json`, 'application/json');
    }
    const parts: string[] = [];
    for (const s of data.sections) {
      if (data.sections.length > 1) parts.push(toCsv([`# ${s.title ?? s.endpoint}`], []));
      if (s.error) {
        parts.push(toCsv(['error'], [[`${s.error.endpoint}: ${s.error.status} ${s.error.message}`]]));
        continue;
      }
      const columns = s.view.type === 'table' ? s.view.columns : undefined;
      const t = tabulate(s.data, columns);
      parts.push(toCsv(t.headers, t.rows));
    }
    return download(parts.join('\r\n'), `${base}.csv`, 'text/csv');
  } catch (e) {
    return handleError(e);
  }
}
