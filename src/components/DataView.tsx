import { flatten, formatCell, getPath, unwrapList } from '../core/data/shape.ts';
import type { View } from '../core/registry/types.ts';

function Cell({ value, format }: { value: unknown; format?: 'date' | 'bool' | 'code' | 'list' }) {
  const text = formatCell(value, format);
  if (text === '') return <span className="text-fg-muted">—</span>;
  if (format === 'code') return <code className="font-mono text-[0.85em] break-all">{text}</code>;
  if (format === 'bool' || typeof value === 'boolean') {
    return <span className={value === true ? 'text-ok' : 'text-fg-muted'}>{text}</span>;
  }
  return <span className="break-words">{text}</span>;
}

export function KeyValueView({ data }: { data: unknown }) {
  const rows = flatten(data);
  if (rows.length === 1 && rows[0]![0] === 'value' && (rows[0]![1] === null || rows[0]![1] === '')) return <p className="text-fg-muted text-sm">Nothing configured.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(12rem,auto)_1fr] gap-x-6 gap-y-0 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="pt-2 sm:py-2 font-medium text-fg-muted font-mono text-[0.8rem] break-all sm:border-b border-border">{k}</dt>
          <dd className="pb-2 sm:py-2 border-b border-border">
            <Cell value={v} format={/(_at|At|date)$/.test(k) ? 'date' : undefined} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TableView({ data, columns }: { data: unknown; columns?: { key: string; label: string; format?: 'date' | 'bool' | 'code' | 'list' }[] }) {
  const list = unwrapList(data);
  if (!Array.isArray(list)) return <KeyValueView data={list} />;
  if (list.length === 0) return <p className="text-fg-muted text-sm">None.</p>;
  const cols = columns?.length
    ? columns
    : [...new Set(list.flatMap((r) => (r && typeof r === 'object' ? flatten(r).map(([k]) => k) : ['value'])))].slice(0, 12).map((k) => ({ key: k, label: k, format: undefined }));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-subtle text-left">
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, i) => (
            <tr key={i} className="border-t border-border align-top">
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-2 max-w-[28rem]">
                  <Cell value={row && typeof row === 'object' ? getPath(row, c.key) : row} format={c.format} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-1.5 text-xs text-fg-muted border-t border-border bg-subtle">{list.length} {list.length === 1 ? 'item' : 'items'}</p>
    </div>
  );
}

export function DataView({ data, view }: { data: unknown; view: View }) {
  if (view.type === 'status') return <p className="text-sm font-medium">{String(data)}</p>;
  if (view.type === 'table') return <TableView data={data} columns={view.columns} />;
  const list = unwrapList(data);
  return Array.isArray(list) ? <TableView data={list} /> : <KeyValueView data={data} />;
}
