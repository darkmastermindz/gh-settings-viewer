// Pure helpers shared by the server and the browser (no secrets, no I/O).

/** Reads a dot path; "a[].b" maps over an array. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  const [head, ...rest] = path.split('.');
  const tail = rest.join('.');
  if (head!.endsWith('[]')) {
    const arr = getPath(value, head!.slice(0, -2));
    return Array.isArray(arr) ? arr.map((v) => getPath(v, tail)) : undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  if (!Object.hasOwn(value, head!)) return undefined;
  const next = (value as Record<string, unknown>)[head!];
  return tail ? getPath(next, tail) : next;
}

/** Removes dot-path fields from objects (and from every element of arrays). Returns a copy. */
export function omitPaths<T>(value: T, paths: readonly string[] = []): T {
  if (!paths.length) return value;
  if (Array.isArray(value)) return value.map((v) => omitPaths(v, paths)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const p of paths) {
    const [head, ...rest] = p.split('.');
    if (!Object.hasOwn(out, head!)) continue;
    if (rest.length === 0) delete out[head!];
    else out[head!] = omitPaths(out[head!], [rest.join('.')]);
  }
  return out as T;
}

/** If a response is `{ total_count, things: [...] }`, returns the array; otherwise the value. */
export function unwrapList(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const entries = Object.entries(value);
  const arrays = entries.filter(([, v]) => Array.isArray(v));
  const others = entries.filter(([k, v]) => !Array.isArray(v) && !/^(total_count|totalCount|incomplete_results|total_seats|totalResults|itemsPerPage|startIndex|schemas)$/.test(k));
  return arrays.length === 1 && others.length === 0 ? arrays[0]![1] : value;
}

export function formatCell(v: unknown, format?: 'date' | 'bool' | 'code' | 'list'): string {
  if (v === null || v === undefined || v === '') return '';
  if (format === 'bool' || typeof v === 'boolean') return v === true ? 'Yes' : v === false ? 'No' : String(v);
  if (format === 'date' && typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  }
  if (format === 'date' && typeof v === 'number') return new Date(v).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') {
    if (format === 'list') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(', ');
    return JSON.stringify(v);
  }
  return String(v);
}

/** Flattens an object into dot-path rows for key/value views and CSV. */
export function flatten(value: unknown, prefix = ''): [string, unknown][] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[prefix || 'value', value]];
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) out.push(...flatten(v, key));
    else out.push([key, v]);
  }
  return out;
}

const csvCell = (s: string) => {
  // Neutralise spreadsheet formulas (CSV injection), then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Column headers and rows for any data: arrays become one row per element; objects become key/value rows. */
export function tabulate(data: unknown, columns?: { key: string; label: string; format?: 'date' | 'bool' | 'code' | 'list' }[]): { headers: string[]; rows: string[][] } {
  const list = unwrapList(data);
  if (Array.isArray(list)) {
    if (columns?.length) return { headers: columns.map((c) => c.label), rows: list.map((r) => columns.map((c) => formatCell(getPath(r, c.key), c.format))) };
    const keys = [...new Set(list.flatMap((r) => (r && typeof r === 'object' ? flatten(r).map(([k]) => k) : ['value'])))];
    return { headers: keys, rows: list.map((r) => { const f = new Map(r && typeof r === 'object' ? flatten(r) : [['value', r]]); return keys.map((k) => formatCell(f.get(k))); }) };
  }
  return { headers: ['Setting', 'Value'], rows: flatten(list).map(([k, v]) => [k, formatCell(v)]) };
}
