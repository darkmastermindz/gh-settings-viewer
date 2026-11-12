import type { Column, PermissionRequirement, RestEndpoint, View } from './types.ts';

export const read = (name: string): PermissionRequirement => ({ name, access: 'read' });
export const rest = (path: `/${string}`, extra: Omit<RestEndpoint, 'kind' | 'path'> = {}): RestEndpoint => ({ kind: 'rest', path, ...extra });
export const keyValue: View = { type: 'keyValue' };
export const table = (...columns: Column[]): View => ({ type: 'table', columns: columns.length ? columns : undefined });
export const col = (key: string, label: string, format?: Column['format']): Column => ({ key, label, format });
export const created = col('created_at', 'Created', 'date');
export const updated = col('updated_at', 'Updated', 'date');

/** Secrets endpoints return names and dates only; listed for clarity. */
export const secretColumns = table(col('name', 'Name', 'code'), col('visibility', 'Visibility'), created, updated);
/** Variables do carry values; this tool shows names and metadata only. */
export const variableColumns = table(col('name', 'Name', 'code'), col('visibility', 'Visibility'), created, updated);
export const webhookColumns = table(col('id', 'ID'), col('name', 'Type'), col('active', 'Active', 'bool'), col('config.url', 'Payload URL', 'code'), col('config.content_type', 'Content type'), col('config.insecure_ssl', 'Insecure SSL'), col('events', 'Events', 'list'), updated);
export const WEBHOOK_OMIT = ['config.secret', 'config.password', 'config.token'];
