import {
  checkTransition,
  DENY_MESSAGES,
  type Principal,
  type Role,
  type WorkflowDef,
} from '@aisrm/shared';
import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError, conflict, forbidden, notFound, unprocessable } from './errors';
import { firestore, nowIso, tcol } from './firebase';
import { audit, canRead, holdersOf, notify, outbox, type ScopedRecord } from './records';

export const transitionBody = z.object({
  action: z.string().min(1).max(64),
  expectedVersion: z.number().int().nonnegative(),
  comment: z.string().max(4000).optional().nullable(),
});
export type TransitionBody = z.infer<typeof transitionBody>;

export interface HookResult {
  /** Trường cập nhật thêm vào hồ sơ. */
  patch?: Record<string, unknown>;
  /** Ghi thêm trong cùng transaction (chạy ở pha ghi). */
  writes?: (tx: Transaction) => void;
  /** Thông báo thêm sau commit. */
  notifyExtra?: { uids: string[]; title: string; body: string; link?: string };
}

export interface TransitionArgs<T extends ScopedRecord & { status: string; version: number }> {
  principal: Principal;
  requestId: string;
  collection: string;
  resourceType: string;
  id: string;
  workflow: WorkflowDef;
  body: TransitionBody;
  idempotencyKey?: string | null;
  link: (id: string) => string;
  titleOf: (rec: T) => string;
  flags?: (rec: T) => Record<string, boolean>;
  /** Kiểm tra/ghi bổ sung theo nghiệp vụ. Chỉ được ĐỌC qua tx trong hook; ghi qua `writes`. */
  hook?: (tx: Transaction, rec: T & { id: string }, to: string, action: string) => Promise<HookResult | void>;
}

export interface TransitionResult {
  id: string;
  from: string;
  to: string;
  version: number;
  replayed: boolean;
}

/**
 * Chuyển trạng thái hồ sơ phía server: kiểm tra version (chống duyệt đồng thời), quyền, trạng thái,
 * điều kiện, phân tách nhiệm vụ; ghi trạng thái + lịch sử + audit + outbox trong một transaction.
 * Thông báo gửi sau commit (không gửi trong transaction có thể retry).
 */
export async function runTransition<T extends ScopedRecord & { status: string; version: number }>(
  a: TransitionArgs<T>,
): Promise<TransitionResult> {
  const { principal: p } = a;
  const ref = tcol(p.tenantId, a.collection).doc(a.id);
  const bodyHash = createHash('sha256').update(JSON.stringify({ id: a.id, ...a.body })).digest('hex');
  const idemRef = a.idempotencyKey
    ? tcol(p.tenantId, 'idempotency').doc(createHash('sha256').update(`${p.uid}|${a.idempotencyKey}`).digest('hex'))
    : null;

  let deniedReason: string | null = null;
  let after: { rec: T & { id: string }; from: string; to: string; actionLabel: string; extra?: HookResult } | null = null;

  const result = await firestore().runTransaction(async (tx) => {
    deniedReason = null;
    after = null;
    if (idemRef) {
      const idem = await tx.get(idemRef);
      if (idem.exists) {
        if (idem.get('bodyHash') !== bodyHash) {
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho một yêu cầu khác.');
        }
        return { ...(idem.get('result') as TransitionResult), replayed: true };
      }
    }
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const rec = { id: snap.id, ...(snap.data() as DocumentData) } as T & {
      id: string;
      returnTo?: string | null;
      actorsByAction?: Record<string, string>;
    };
    if (!canRead(p, rec)) throw notFound();
    if (rec.version !== a.body.expectedVersion) {
      throw conflict('VERSION_CONFLICT', 'Hồ sơ đã được người khác cập nhật. Vui lòng tải lại trước khi thao tác.', {
        currentVersion: rec.version,
        currentStatus: rec.status,
      });
    }
    const check = checkTransition(
      a.workflow,
      rec.status,
      a.body.action,
      {
        principal: p,
        ownerUid: rec.ownerUid,
        unitPath: rec.unitPath,
        flags: a.flags?.(rec) ?? {},
        returnTo: rec.returnTo ?? null,
        actorsByAction: rec.actorsByAction ?? {},
      },
      a.body.comment,
    );
    if (!check.ok) {
      deniedReason = check.reason;
      return null;
    }
    const extra = (await a.hook?.(tx, rec, check.to, a.body.action)) ?? undefined;

    // ---- pha ghi ----
    const now = nowIso();
    const version = rec.version + 1;
    tx.update(ref, {
      status: check.to,
      version,
      updatedAt: now,
      updatedBy: p.uid,
      [`actorsByAction.${a.body.action}`]: p.uid,
      returnTo: check.transition.setsReturnTo ? rec.status : check.transition.to === '$RETURN' ? null : (rec.returnTo ?? null),
      ...(extra?.patch ?? {}),
    });
    tx.set(ref.collection('history').doc(), {
      action: a.body.action,
      actionLabel: check.transition.label,
      from: rec.status,
      to: check.to,
      actorUid: p.uid,
      actorName: p.displayName,
      comment: a.body.comment?.trim() || null,
      at: now,
      version,
      revisionNo: (extra?.patch?.currentRevisionNo as number | undefined) ?? null,
    });
    extra?.writes?.(tx);
    audit(
      {
        actor: p,
        action: `${a.resourceType}.${a.body.action}`,
        resourceType: a.resourceType,
        resourceId: a.id,
        resourceVersion: version,
        requestId: a.requestId,
        detail: `${rec.status} → ${check.to}`,
      },
      tx,
    );
    outbox(tx, p.tenantId, {
      eventType: `research.${a.resourceType}.${check.to.toLowerCase()}`,
      entityType: a.resourceType,
      entityId: a.id,
      entityVersion: version,
      data: { status: check.to, code: (rec as unknown as { code?: string }).code ?? null },
    });
    const res: TransitionResult = { id: a.id, from: rec.status, to: check.to, version, replayed: false };
    if (idemRef) tx.set(idemRef, { bodyHash, result: res, createdAt: now, uid: p.uid });
    after = { rec, from: rec.status, to: check.to, actionLabel: check.transition.label, extra };
    return res;
  });

  if (!result) {
    const reason: string = (deniedReason as string | null) ?? 'FORBIDDEN_ROLE';
    await audit({
      actor: p,
      action: `${a.resourceType}.${a.body.action}`,
      resourceType: a.resourceType,
      resourceId: a.id,
      result: 'DENIED',
      requestId: a.requestId,
      detail: reason,
    });
    const message = DENY_MESSAGES[reason as keyof typeof DENY_MESSAGES] ?? 'Không thực hiện được thao tác.';
    if (reason === 'COMMENT_REQUIRED') throw unprocessable(reason, message);
    if (reason === 'INVALID_STATE' || reason === 'CONDITION_NOT_MET' || reason === 'UNKNOWN_ACTION') {
      throw conflict(reason, message);
    }
    throw forbidden(message, reason);
  }

  if (after && !result.replayed) {
    const done = after as { rec: T & { id: string }; from: string; to: string; actionLabel: string; extra?: HookResult };
    try {
      await sendNotifications(a, done);
    } catch {
      // Thông báo là best-effort; không làm hỏng thao tác nghiệp vụ đã ghi.
    }
  }
  return result;
}

async function sendNotifications<T extends ScopedRecord & { status: string; version: number }>(
  a: TransitionArgs<T>,
  done: { rec: T & { id: string }; to: string; actionLabel: string; extra?: HookResult },
) {
  const p = a.principal;
  const title = a.titleOf(done.rec);
  const stateLabel = a.workflow.states[done.to]?.label ?? done.to;
  const link = a.link(done.rec.id);
  if (done.rec.ownerUid !== p.uid) {
    await notify(p.tenantId, [done.rec.ownerUid], {
      title: `${done.actionLabel}: ${title}`,
      body: `${p.displayName} đã thực hiện "${done.actionLabel}". Trạng thái mới: ${stateLabel}.`,
      link,
    });
  }
  // Người cần xử lý bước tiếp theo
  const nextRoles = new Set<Role>();
  for (const t of a.workflow.transitions) {
    if (!t.from.includes(done.to) || t.tone !== 'primary') continue;
    t.actor.roles?.forEach((r) => nextRoles.add(r));
  }
  const uids = nextRoles.size ? await holdersOf(p.tenantId, [...nextRoles].slice(0, 10), done.rec.unitPath) : [];
  const targets = uids.filter((u) => u !== p.uid && u !== done.rec.ownerUid);
  if (targets.length) {
    await notify(p.tenantId, targets, { title: `Cần xử lý: ${title}`, body: `Hồ sơ đang ở bước "${stateLabel}".`, link });
  }
  if (done.extra?.notifyExtra) {
    const n = done.extra.notifyExtra;
    await notify(p.tenantId, n.uids, { title: n.title, body: n.body, link: n.link ?? link });
  }
}

export function parseIdempotencyKey(v: string | undefined): string | null {
  if (!v) return null;
  if (!/^[\w-]{8,128}$/.test(v)) throw new AppError(400, 'BAD_IDEMPOTENCY_KEY', 'Idempotency-Key không hợp lệ.');
  return v;
}
