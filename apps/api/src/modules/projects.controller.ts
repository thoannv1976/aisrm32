import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import {
  hasRoleFor,
  PROJECT_WORKFLOW,
  SCIENCE_OFFICE,
  type ChangeRequest,
  type DocumentMeta,
  type Milestone,
  type Principal,
  type Project,
} from '@aisrm/shared';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit, canRead, hasReviewAccess, listVisible, notify } from '../common/records';
import { parseIdempotencyKey, runTransition, transitionBody } from '../common/transition';
import { docData, parse, todayIso, withActions } from '../common/util';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày YYYY-MM-DD');
const isOffice = (p: Principal, r: Project) => hasRoleFor(p, SCIENCE_OFFICE, r.unitPath) && r.ownerUid !== p.uid;
const isTeam = (p: Principal, r: Project) => r.ownerUid === p.uid || r.memberUids.includes(p.uid);

async function loadReadable(p: Principal, id: string) {
  const snap = await tcol(p.tenantId, 'projects').doc(id).get();
  if (!snap.exists) throw notFound();
  const rec = docData<Project>(snap);
  if (!canRead(p, rec) && !(await hasReviewAccess(p, rec.id))) throw notFound();
  return rec;
}

function computeStats(ms: Milestone[]) {
  const open = ms.filter((m) => m.status !== 'ACCEPTED').map((m) => m.dueDate).sort();
  return {
    total: ms.length,
    accepted: ms.filter((m) => m.status === 'ACCEPTED').length,
    open: ms.filter((m) => m.status === 'OPEN').length,
    nextDue: open[0] ?? null,
  };
}

/**
 * Thay đổi con (mốc, yêu cầu thay đổi) chạy trong transaction, kiểm tra version đề tài,
 * cập nhật thống kê mốc và tăng version đề tài để chống ghi đè đồng thời.
 */
async function mutateProject<R>(
  p: Principal,
  rid: string,
  id: string,
  action: string,
  fn: (tx: Transaction, rec: Project & { id: string }, milestones: (Milestone & { id: string })[]) => Promise<{ result: R; changedMilestones?: boolean; patch?: Record<string, unknown>; detail?: string }>,
): Promise<R> {
  const ref = tcol(p.tenantId, 'projects').doc(id);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const rec = docData<Project>(snap);
    if (!canRead(p, rec)) throw notFound();
    const msSnap = await tx.get(ref.collection('milestones'));
    const milestones = msSnap.docs.map((d) => docData<Milestone>(d));
    const out = await fn(tx, rec, milestones);
    const version = rec.version + 1;
    tx.update(ref, { ...(out.patch ?? {}), version, updatedAt: nowIso(), updatedBy: p.uid });
    audit({ actor: p, action: `project.${action}`, resourceType: 'project', resourceId: id, resourceVersion: version, requestId: rid, detail: out.detail ?? null }, tx);
    return out.result;
  });
}

@Controller('projects')
export class ProjectsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal, @Query('status') status?: string) {
    let items = await listVisible<Project>(p, 'projects', { memberField: 'memberUids' });
    if (status) items = items.filter((x) => status.split(',').includes(x.status));
    const today = todayIso();
    return {
      items: items.map((x) => ({
        id: x.id,
        code: x.code,
        title: x.title,
        status: x.status,
        ownerName: x.ownerName,
        unitName: x.unitName,
        budgetVnd: x.budgetVnd,
        startDate: x.startDate,
        endDate: x.endDate,
        milestoneStats: x.milestoneStats,
        overdue: !!x.milestoneStats?.nextDue && x.milestoneStats.nextDue < today && x.status === 'ACTIVE',
        updatedAt: x.updatedAt,
      })),
      nextCursor: null,
    };
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const rec = await loadReadable(p, id);
    const ref = tcol(p.tenantId, 'projects').doc(id);
    const [ms, crs, docs] = await Promise.all([
      ref.collection('milestones').orderBy('dueDate', 'asc').get(),
      ref.collection('changeRequests').orderBy('requestedAt', 'desc').get(),
      tcol(p.tenantId, 'documents').where('parentId', '==', id).where('status', '==', 'ACTIVE').get(),
    ]);
    const today = todayIso();
    return {
      ...withActions(PROJECT_WORKFLOW, rec, p),
      milestones: ms.docs.map((d) => {
        const m = docData<Milestone>(d);
        return { ...m, overdue: m.status === 'OPEN' && m.dueDate < today };
      }),
      changeRequests: crs.docs.map((d) => docData<ChangeRequest>(d)),
      documents: docs.docs.map((d) => docData<DocumentMeta>(d)).filter((d) => d.parentType === 'project'),
      permissions: {
        isOffice: isOffice(p, rec),
        isTeam: isTeam(p, rec),
        isOwner: rec.ownerUid === p.uid,
      },
    };
  }

  @Post(':id/transitions')
  async transition(
    @CurrentPrincipal() p: Principal,
    @RequestId() rid: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const b = parse(transitionBody, body);
    return runTransition<Project>({
      principal: p,
      requestId: rid,
      collection: 'projects',
      resourceType: 'project',
      id,
      workflow: PROJECT_WORKFLOW,
      body: b,
      idempotencyKey: parseIdempotencyKey(idemKey),
      link: (x) => `/projects/${x}`,
      titleOf: (r) => `${r.code} — ${r.title}`,
      hook: async (tx, rec, _to, action) => {
        const msSnap = await tx.get(tcol(p.tenantId, 'projects').doc(rec.id).collection('milestones'));
        const ms = msSnap.docs.map((d) => d.data() as Milestone);
        if (action === 'activate') {
          if (!rec.startDate || !rec.endDate) throw unprocessable('SCHEDULE_REQUIRED', 'Cần cập nhật ngày bắt đầu và kết thúc trước khi giao nhiệm vụ.');
          if (ms.length === 0) throw unprocessable('MILESTONES_REQUIRED', 'Cần thiết lập ít nhất một mốc tiến độ / sản phẩm.');
        }
        if (action === 'request_acceptance' && ms.some((m) => m.status === 'OPEN')) {
          throw unprocessable('MILESTONES_INCOMPLETE', 'Còn mốc / sản phẩm chưa nộp; chưa thể đề nghị nghiệm thu.');
        }
        if (action === 'complete' && ms.some((m) => m.status !== 'ACCEPTED')) {
          throw unprocessable('MILESTONES_NOT_ACCEPTED', 'Tất cả sản phẩm phải được chấp nhận trước khi xác nhận hoàn thành.');
        }
      },
    });
  }

  /** Cập nhật thời gian thực hiện — phòng KH, khi chờ giao nhiệm vụ. */
  @Post(':id/schedule')
  async schedule(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ startDate: dateStr, endDate: dateStr, expectedVersion: z.number().int() }), body);
    if (b.endDate <= b.startDate) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu.');
    return mutateProject(p, rid, id, 'schedule', async (_tx, rec) => {
      if (rec.version !== b.expectedVersion) throw conflict('VERSION_CONFLICT', 'Đề tài đã được cập nhật bởi người khác.');
      if (!isOffice(p, rec)) throw forbidden();
      if (rec.status !== 'CONTRACT_PENDING') throw conflict('INVALID_STATE', 'Chỉ cập nhật thời gian khi đề tài chờ giao nhiệm vụ; sau đó dùng yêu cầu gia hạn.');
      return { result: { ok: true }, patch: { startDate: b.startDate, endDate: b.endDate }, detail: `${b.startDate} → ${b.endDate}` };
    });
  }

  @Post(':id/milestones')
  async addMilestone(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ title: z.string().min(2).max(300), dueDate: dateStr, deliverable: z.string().max(2000).default('') }), body);
    return mutateProject(p, rid, id, 'milestone.add', async (tx, rec, ms) => {
      if (!(rec.ownerUid === p.uid || isOffice(p, rec))) throw forbidden();
      if (!['CONTRACT_PENDING', 'ACTIVE'].includes(rec.status)) throw conflict('INVALID_STATE', 'Không thêm mốc ở trạng thái hiện tại.');
      if (rec.endDate && b.dueDate > rec.endDate) throw badRequest('Hạn mốc vượt quá ngày kết thúc đề tài.');
      const ref = tcol(p.tenantId, 'projects').doc(id).collection('milestones').doc();
      const m: Omit<Milestone, 'id'> = {
        title: b.title,
        dueDate: b.dueDate,
        deliverable: b.deliverable,
        status: 'OPEN',
        submittedAt: null,
        submittedNote: null,
        documentIds: [],
        acceptedBy: null,
        acceptedAt: null,
        createdAt: nowIso(),
      };
      tx.set(ref, m);
      return { result: { id: ref.id }, patch: { milestoneStats: computeStats([...ms, { ...m, id: ref.id }]) }, detail: b.title };
    });
  }

  @Post(':id/milestones/:mid/:op')
  async milestoneOp(
    @CurrentPrincipal() p: Principal,
    @RequestId() rid: string,
    @Param('id') id: string,
    @Param('mid') mid: string,
    @Param('op') op: string,
    @Body() body: unknown,
  ) {
    const b = parse(z.object({ note: z.string().max(4000).optional().nullable() }), body);
    if (!['submit', 'accept', 'return'].includes(op)) throw notFound();
    let notifyOwner: { uid: string; title: string } | null = null;
    const out = await mutateProject(p, rid, id, `milestone.${op}`, async (tx, rec, ms) => {
      const m = ms.find((x) => x.id === mid);
      if (!m) throw notFound('Không tìm thấy mốc.');
      const ref = tcol(p.tenantId, 'projects').doc(id).collection('milestones').doc(mid);
      const now = nowIso();
      let updated: Milestone;
      if (op === 'submit') {
        if (!isTeam(p, rec)) throw forbidden('Chỉ nhóm thực hiện được nộp sản phẩm.');
        if (!['ACTIVE', 'COMPLETION_REVISION'].includes(rec.status)) throw conflict('INVALID_STATE', 'Đề tài không ở trạng thái thực hiện.');
        if (m.status !== 'OPEN') throw conflict('INVALID_STATE', 'Mốc đã được nộp.');
        const docs = await tx.get(tcol(p.tenantId, 'documents').where('parentId', '==', id).where('milestoneId', '==', mid).where('status', '==', 'ACTIVE'));
        if (docs.empty && !b.note?.trim()) throw unprocessable('EVIDENCE_REQUIRED', 'Cần đính kèm sản phẩm hoặc ghi chú minh chứng.');
        updated = { ...m, status: 'SUBMITTED', submittedAt: now, submittedNote: b.note?.trim() || null, documentIds: docs.docs.map((d) => d.id) };
      } else if (op === 'accept') {
        if (!isOffice(p, rec)) throw forbidden('Chỉ phòng KH (không phải chủ nhiệm) được chấp nhận sản phẩm.');
        if (m.status !== 'SUBMITTED') throw conflict('INVALID_STATE', 'Mốc chưa được nộp.');
        updated = { ...m, status: 'ACCEPTED', acceptedBy: p.uid, acceptedAt: now };
        notifyOwner = { uid: rec.ownerUid, title: `Sản phẩm "${m.title}" đã được chấp nhận` };
      } else {
        if (!isOffice(p, rec)) throw forbidden();
        if (m.status !== 'SUBMITTED') throw conflict('INVALID_STATE', 'Mốc chưa được nộp.');
        if (!b.note?.trim()) throw unprocessable('COMMENT_REQUIRED', 'Cần nêu lý do trả lại.');
        updated = { ...m, status: 'OPEN', submittedAt: null };
        notifyOwner = { uid: rec.ownerUid, title: `Sản phẩm "${m.title}" bị trả lại: ${b.note}` };
      }
      const { id: _drop, ...data } = updated as Milestone & { id: string };
      tx.set(ref, data);
      return { result: { id: mid, status: updated.status }, patch: { milestoneStats: computeStats(ms.map((x) => (x.id === mid ? updated : x))) }, detail: m.title };
    });
    if (notifyOwner) {
      const n = notifyOwner as { uid: string; title: string };
      await notify(p.tenantId, [n.uid], { title: n.title, body: `Đề tài ${id}`, link: `/projects/${id}` }).catch(() => undefined);
    }
    return out;
  }

  @Post(':id/change-requests')
  async createChange(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(
      z.object({ type: z.enum(['EXTENSION', 'MEMBER', 'BUDGET', 'OTHER']), reason: z.string().min(5).max(4000), proposedEndDate: dateStr.nullable().optional() }),
      body,
    );
    if (b.type === 'EXTENSION' && !b.proposedEndDate) throw badRequest('Yêu cầu gia hạn cần ngày kết thúc mới.');
    return mutateProject(p, rid, id, 'change.request', async (tx, rec) => {
      if (rec.ownerUid !== p.uid) throw forbidden('Chỉ chủ nhiệm được gửi yêu cầu thay đổi.');
      if (!['ACTIVE', 'SUSPENDED'].includes(rec.status)) throw conflict('INVALID_STATE', 'Chỉ gửi yêu cầu khi đề tài đang thực hiện.');
      if (b.type === 'EXTENSION' && rec.endDate && b.proposedEndDate! <= rec.endDate) throw badRequest('Ngày kết thúc mới phải sau ngày kết thúc hiện tại.');
      const ref = tcol(p.tenantId, 'projects').doc(id).collection('changeRequests').doc();
      const cr: Omit<ChangeRequest, 'id'> = {
        type: b.type,
        reason: b.reason,
        proposedEndDate: b.proposedEndDate ?? null,
        status: 'PENDING',
        requestedBy: p.uid,
        requestedByName: p.displayName,
        requestedAt: nowIso(),
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      };
      tx.set(ref, cr);
      return { result: { id: ref.id }, patch: { pendingChangeRequests: FieldValue.increment(1) }, detail: b.type };
    });
  }

  @Post(':id/change-requests/:cid/decide')
  async decideChange(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Param('cid') cid: string, @Body() body: unknown) {
    const b = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().max(4000).optional().nullable() }), body);
    let ownerUid = '';
    const out = await mutateProject(p, rid, id, `change.${b.decision.toLowerCase()}`, async (tx, rec) => {
      if (!isOffice(p, rec)) throw forbidden('Chỉ phòng KH (không phải chủ nhiệm) được quyết định yêu cầu thay đổi.');
      const ref = tcol(p.tenantId, 'projects').doc(id).collection('changeRequests').doc(cid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const cr = snap.data() as ChangeRequest;
      if (cr.status !== 'PENDING') throw conflict('INVALID_STATE', 'Yêu cầu đã được xử lý.');
      if (b.decision === 'REJECTED' && !b.note?.trim()) throw unprocessable('COMMENT_REQUIRED', 'Cần nêu lý do không chấp thuận.');
      tx.update(ref, { status: b.decision, decidedBy: p.uid, decidedAt: nowIso(), decisionNote: b.note?.trim() || null });
      ownerUid = rec.ownerUid;
      const patch: Record<string, unknown> = { pendingChangeRequests: FieldValue.increment(-1) };
      if (b.decision === 'APPROVED' && cr.type === 'EXTENSION' && cr.proposedEndDate) patch.endDate = cr.proposedEndDate;
      return { result: { id: cid, status: b.decision }, patch, detail: `${cr.type} ${b.decision}` };
    });
    await notify(p.tenantId, [ownerUid], {
      title: b.decision === 'APPROVED' ? 'Yêu cầu thay đổi được chấp thuận' : 'Yêu cầu thay đổi không được chấp thuận',
      body: b.note ?? '',
      link: `/projects/${id}`,
    }).catch(() => undefined);
    return out;
  }

  @Get(':id/history')
  async history(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await loadReadable(p, id);
    const snap = await tcol(p.tenantId, 'projects').doc(id).collection('history').orderBy('at', 'asc').get();
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
}
