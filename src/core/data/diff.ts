// Builds a comparison table for the same page across several targets. Pure; used in the browser.
import { flatten, formatCell, getPath, unwrapList } from './shape.ts';
import type { Column } from '../registry/types.ts';

const IDENTITY_KEYS = ['name', 'login', 'slug', 'property_name', 'key_prefix', 'allowListValue', 'title', 'app_slug', 'id', 'node.login', 'assignee.login', 'userName', 'displayName'];

export interface DiffRow {
  key: string;
  values: string[];
  differs: boolean;
}

function identity(row: unknown, columns?: Column[]): string {
  if (!row || typeof row !== 'object') return String(row);
  for (const k of [...(columns?.[0] ? [columns[0].key] : []), ...IDENTITY_KEYS]) {
    const v = getPath(row, k);
    if (v !== undefined && v !== null && typeof v !== 'object') return String(v);
  }
  return JSON.stringify(row);
}

function describe(row: unknown, columns?: Column[]): string {
  if (!row || typeof row !== 'object') return formatCell(row);
  if (columns?.length) return columns.slice(1).map((c) => `${c.label}: ${formatCell(getPath(row, c.key), c.format) || '—'}`).join('; ') || 'present';
  return flatten(row).map(([k, v]) => `${k}=${formatCell(v)}`).join('; ');
}

/** Rows keyed by setting path (objects) or item identity (lists), one value per target. */
export function diffSection(datasets: unknown[], columns?: Column[]): DiffRow[] {
  const maps = datasets.map((d) => {
    const m = new Map<string, string>();
    const list = unwrapList(d);
    if (Array.isArray(list)) for (const row of list) m.set(identity(row, columns), describe(row, columns));
    else for (const [k, v] of flatten(list)) m.set(k, formatCell(v));
    return m;
  });
  const keys = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a.localeCompare(b));
  return keys.map((key) => {
    const values = maps.map((m) => (m.has(key) ? m.get(key)! : '(missing)'));
    return { key, values, differs: new Set(values).size > 1 };
  });
}
