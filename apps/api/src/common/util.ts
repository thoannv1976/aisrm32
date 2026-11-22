import {
  availableActions,
  type Principal,
  type WithActions,
  type WorkflowDef,
} from '@aisrm/shared';
import { type DocSnap } from '../infra';
import type { z } from 'zod';
import type { ScopedRecord } from './records';

export function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return schema.parse(body ?? {});
}

export function docData<T>(snap: DocSnap): T & { id: string } {
  return { id: snap.id, ...(snap.data() as object) } as T & { id: string };
}

export function withActions<T extends ScopedRecord & { status: string; returnTo?: string | null; actorsByAction?: Record<string, string> }>(
  def: WorkflowDef,
  rec: T,
  p: Principal,
  opts: { flags?: Record<string, boolean>; canEdit?: boolean } = {},
): WithActions<T> {
  const actions = availableActions(def, rec.status, {
    principal: p,
    ownerUid: rec.ownerUid,
    unitPath: rec.unitPath,
    flags: opts.flags ?? {},
    returnTo: rec.returnTo ?? null,
    actorsByAction: rec.actorsByAction ?? {},
  }).map((t) => ({ action: t.action, label: t.label, requireComment: !!t.requireComment, tone: t.tone ?? 'default' }));
  return { item: rec, actions, canEdit: !!opts.canEdit };
}

/** CSV có BOM UTF-8 để Excel hiển thị đúng tiếng Việt. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Chặn CSV injection khi mở bằng Excel
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
