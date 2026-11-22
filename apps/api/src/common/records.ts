import {
  hasRoleFor,
  TENANT_READERS,
  UNIT_REVIEWERS,
  unitScopesFor,
  type Principal,
  type Role,
} from '@aisrm/shared';
import { type DocRef, type Query, type Tx } from '../infra';
import { randomUUID } from 'node:crypto';
import { db, nowIso, tcol } from '../infra';
import { mailNotifications } from '../infra/mailer';

export interface ScopedRecord {
  ownerUid: string;
  unitPath: string[];
  memberUids?: string[];
  authorUids?: string[];
}

/** Quyền đọc hồ sơ nghiên cứu: chủ hồ sơ, thành viên/tác giả, đầu mối/lãnh đạo đơn vị, phòng KH và BGH. */
export function canRead(p: Principal, r: ScopedRecord): boolean {
  if (r.ownerUid === p.uid) return true;
  if (r.memberUids?.includes(p.uid) || r.authorUids?.includes(p.uid)) return true;
  return hasRoleFor(p, [...UNIT_REVIEWERS, ...TENANT_READERS], r.unitPath);
}

export function isTenantReader(p: Principal): boolean {
  return hasRoleFor(p, TENANT_READERS, null);
}

/**
 * Lấy danh sách hồ sơ người dùng được xem, bằng các truy vấn có phạm vi
 * (không tải toàn bộ rồi lọc ở client).
 */
export async function listVisible<T extends { id: string; updatedAt: string }>(
  p: Principal,
  collection: string,
  opts: { memberField?: 'memberUids' | 'authorUids' | 'personUids'; limit?: number } = {},
): Promise<T[]> {
  const col = tcol(p.tenantId, collection);
  const limit = Math.min(opts.limit ?? 500, 1000);
  const queries: Query[] = [];
  if (isTenantReader(p)) {
    queries.push(col.orderBy('updatedAt', 'desc').limit(limit));
  } else {
    queries.push(col.where('ownerUid', '==', p.uid).limit(limit));
    if (opts.memberField) queries.push(col.where(opts.memberField, 'array-contains', p.uid).limit(limit));
    const scopes = unitScopesFor(p, UNIT_REVIEWERS);
    for (let i = 0; i < scopes.length; i += 30) {
      queries.push(col.where('unitPath', 'array-contains-any', scopes.slice(i, i + 30)).limit(limit));
    }
  }
  const snaps = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, T>();
  for (const s of snaps) for (const d of s.docs) map.set(d.id, { id: d.id, ...d.data() } as T);
  return [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Sinh mã hồ sơ duy nhất theo năm trong transaction (vd: DX-2026-0007).
 * Firestore yêu cầu mọi lệnh đọc trước lệnh ghi: gọi hàm này ở pha đọc, gọi `commit()` ở pha ghi.
 */
export async function reserveCode(tx: Tx, tenantId: string, prefix: string) {
  const year = new Date().getFullYear();
  const ref = tcol(tenantId, 'counters').doc(`${prefix}-${year}`);
  const snap = await tx.get(ref);
  const n = (snap.exists ? (snap.get('value') as number) : 0) + 1;
  return {
    code: `${prefix}-${year}-${String(n).padStart(4, '0')}`,
    commit: () => tx.set(ref, { value: n, updatedAt: nowIso() }, { merge: true }),
  };
}

export interface AuditInput {
  actor: Principal;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceVersion?: number | null;
  result?: 'SUCCESS' | 'DENIED' | 'ERROR';
  requestId?: string | null;
  detail?: string | null;
}

/** Nhật ký kiểm toán: ai, vai trò, làm gì, trên hồ sơ/phiên bản nào, khi nào, kết quả. Không chứa nội dung nhạy cảm. */
export function audit(input: AuditInput, tx?: Tx) {
  const ref = tcol(input.actor.tenantId, 'auditEvents').doc();
  const data = {
    at: nowIso(),
    actorUid: input.actor.uid,
    actorName: input.actor.displayName,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceVersion: input.resourceVersion ?? null,
    result: input.result ?? 'SUCCESS',
    requestId: input.requestId ?? null,
    detail: input.detail ?? null,
  };
  if (tx) tx.set(ref, data);
  else return ref.set(data);
}

/** Outbox: sự kiện nghiệp vụ ghi cùng transaction, dispatcher (Giai đoạn 3) gửi sang UNI-DATA360. */
export function outbox(
  tx: Tx,
  tenantId: string,
  e: { eventType: string; entityType: string; entityId: string; entityVersion: number; data: Record<string, unknown> },
) {
  const ref = tcol(tenantId, 'outboxEvents').doc();
  tx.set(ref, {
    eventId: randomUUID(),
    schemaVersion: '1.0',
    tenantId,
    sourceSystem: 'AI-SRM',
    occurredAt: nowIso(),
    correlationId: randomUUID(),
    operation: 'upsert',
    status: 'PENDING',
    attempts: 0,
    ...e,
  });
}

/** Thông báo trong ứng dụng — ghi sau khi transaction nghiệp vụ đã commit. */
export async function notify(tenantId: string, uids: string[], n: { title: string; body: string; link?: string | null }, kind: 'notification' | 'deadline' = 'notification') {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return;
  const batch = db().batch();
  for (const uid of unique) {
    batch.set(tcol(tenantId, 'notifications').doc(), {
      uid,
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      read: false,
      createdAt: nowIso(),
    });
  }
  await batch.commit();
  await mailNotifications(tenantId, unique, n, kind).catch(() => undefined);
}

/** Người giữ vai trò áp dụng cho đơn vị (để gửi thông báo việc cần xử lý). */
export async function holdersOf(tenantId: string, roles: Role[], unitPath: string[] | null): Promise<string[]> {
  const snap = await tcol(tenantId, 'roleBindings').where('role', 'in', roles).get();
  const now = new Date();
  return snap.docs
    .map((d) => d.data())
    .filter((b) => (!b.validUntil || new Date(b.validUntil) >= now) && (!b.validFrom || new Date(b.validFrom) <= now))
    .filter((b) => b.scopeType === 'tenant' || (unitPath && unitPath.includes(b.scopeId)))
    .map((b) => b.uid as string);
}

export type Ref = DocRef;

/**
 * Quyền xem hồ sơ của thành viên hội đồng: chỉ cấp sau khi khai báo không xung đột lợi ích với đúng hồ sơ đó,
 * hết hiệu lực khi hội đồng xác nhận biên bản hoặc quá hạn.
 */
export async function hasReviewAccess(p: Principal, targetId: string): Promise<boolean> {
  const s = await tcol(p.tenantId, 'reviewAccess').doc(`${p.uid}__${targetId}`).get();
  if (!s.exists || s.get('active') !== true) return false;
  const until = s.get('until') as string | null;
  return !until || new Date(until) > new Date();
}
