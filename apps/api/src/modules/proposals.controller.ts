import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  PROJECT_WORKFLOW,
  PROPOSAL_WORKFLOW,
  validateSubmission,
  type Call,
  type DocumentMeta,
  type Principal,
  type Proposal,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, unitPathOf } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit, canRead, listVisible, reserveCode } from '../common/records';
import { parseIdempotencyKey, runTransition, transitionBody } from '../common/transition';
import { docData, parse, withActions } from '../common/util';
import { callIsOpen } from './calls.controller';
import { checkProposal, summarizeProposal } from '../ai/features';

const memberSchema = z.object({
  uid: z.string().max(128).nullable(),
  name: z.string().min(1).max(200),
  role: z.enum(['PI', 'MEMBER', 'SECRETARY']),
  unitName: z.string().max(200).nullable().optional(),
});

const patchSchema = z.object({
  expectedVersion: z.number().int(),
  title: z.string().max(500).optional(),
  fields: z.record(z.string(), z.union([z.string().max(20000), z.number(), z.null()])).optional(),
  budgetVnd: z.number().int().nonnegative().nullable().optional(),
  durationMonths: z.number().int().positive().max(120).nullable().optional(),
  members: z.array(memberSchema).max(30).optional(),
});

const EDITABLE = ['DRAFT', 'NEEDS_REVISION'];

export const canEditProposal = (p: Principal, r: Proposal) => r.ownerUid === p.uid && EDITABLE.includes(r.status);

async function loadReadable(p: Principal, id: string) {
  const snap = await tcol(p.tenantId, 'proposals').doc(id).get();
  if (!snap.exists) throw notFound();
  const rec = docData<Proposal>(snap);
  if (!canRead(p, rec)) throw notFound();
  return rec;
}

@Controller('proposals')
export class ProposalsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal, @Query('status') status?: string, @Query('mine') mine?: string) {
    let items = await listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids' });
    if (status) items = items.filter((x) => status.split(',').includes(x.status));
    if (mine === '1') items = items.filter((x) => x.ownerUid === p.uid || x.memberUids?.includes(p.uid));
    return {
      items: items.map((x) => ({
        id: x.id,
        code: x.code,
        title: x.title,
        status: x.status,
        ownerName: x.ownerName,
        unitName: x.unitName,
        callCode: x.callCode,
        callTitle: x.callTitle,
        budgetVnd: x.budgetVnd,
        updatedAt: x.updatedAt,
        submittedAt: x.submittedAt,
      })),
      nextCursor: null,
    };
  }

  @Post()
  async create(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = parse(z.object({ callId: z.string().min(1), title: z.string().max(500).default('') }), body);
    if (!p.unitId) throw badRequest('Tài khoản chưa gắn đơn vị công tác; liên hệ quản trị để cập nhật.');
    const callSnap = await tcol(p.tenantId, 'calls').doc(b.callId).get();
    if (!callSnap.exists) throw notFound('Không tìm thấy đợt đăng ký.');
    const call = docData<Call>(callSnap);
    if (!callIsOpen(call)) throw conflict('CALL_CLOSED', 'Đợt đăng ký chưa mở hoặc đã hết hạn nộp.');
    const { path, unit } = await unitPathOf(p.tenantId, p.unitId);
    const ref = tcol(p.tenantId, 'proposals').doc();
    const code = await firestore().runTransaction(async (tx) => {
      const r = await reserveCode(tx, p.tenantId, 'DX');
      r.commit();
      const now = nowIso();
      const rec: Omit<Proposal, 'id'> = {
        tenantId: p.tenantId,
        code: r.code,
        callId: call.id,
        callCode: call.code,
        callTitle: call.title,
        formVersion: call.form.version,
        workflowKey: 'proposal',
        workflowVersion: PROPOSAL_WORKFLOW.version,
        title: b.title,
        ownerUid: p.uid,
        ownerName: p.displayName,
        unitId: unit.id,
        unitPath: path,
        unitName: unit.name,
        members: [{ uid: p.uid, name: p.displayName, role: 'PI', unitName: unit.name }],
        memberUids: [p.uid],
        fields: {},
        budgetVnd: null,
        durationMonths: null,
        status: PROPOSAL_WORKFLOW.initial,
        returnTo: null,
        actorsByAction: {},
        currentRevisionNo: 0,
        submittedAt: null,
        decidedAt: null,
        projectId: null,
        expertReview: call.expertReview,
        classification: 'INTERNAL',
        createdAt: now,
        createdBy: p.uid,
        updatedAt: now,
        updatedBy: p.uid,
        version: 1,
      };
      tx.set(ref, rec);
      audit({ actor: p, action: 'proposal.create', resourceType: 'proposal', resourceId: ref.id, resourceVersion: 1, requestId: rid }, tx);
      return r.code;
    });
    return { id: ref.id, code };
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const rec = await loadReadable(p, id);
    const [callSnap, docs] = await Promise.all([
      tcol(p.tenantId, 'calls').doc(rec.callId).get(),
      tcol(p.tenantId, 'documents').where('parentId', '==', id).where('status', '==', 'ACTIVE').get(),
    ]);
    const call = docData<Call>(callSnap);
    const documents = docs.docs.map((d) => docData<DocumentMeta>(d)).filter((d) => d.parentType === 'proposal');
    const editable = canEditProposal(p, rec);
    const issues = editable
      ? validateSubmission(call.form, rec.fields, documents.map((d) => d.checklistKey ?? ''), {
          title: rec.title,
          budgetVnd: rec.budgetVnd,
          durationMonths: rec.durationMonths,
        })
      : [];
    return {
      ...withActions(PROPOSAL_WORKFLOW, rec, p, { flags: { expertReview: rec.expertReview }, canEdit: editable }),
      form: call.form,
      call: { id: call.id, code: call.code, title: call.title, closeAt: call.closeAt, isOpenNow: callIsOpen(call) },
      documents,
      issues,
    };
  }

  @Patch(':id')
  async update(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(patchSchema, body);
    const ref = tcol(p.tenantId, 'proposals').doc(id);
    return firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const rec = docData<Proposal>(snap);
      if (!canRead(p, rec)) throw notFound();
      if (!canEditProposal(p, rec)) throw forbidden('Chỉ chủ nhiệm được sửa hồ sơ khi ở trạng thái Nháp hoặc Cần bổ sung.');
      if (rec.version !== b.expectedVersion) {
        throw conflict('VERSION_CONFLICT', 'Hồ sơ đã thay đổi ở nơi khác. Vui lòng tải lại.', { currentVersion: rec.version });
      }
      const patch: Record<string, unknown> = {};
      if (b.title !== undefined) patch.title = b.title;
      if (b.fields !== undefined) patch.fields = b.fields;
      if (b.budgetVnd !== undefined) patch.budgetVnd = b.budgetVnd;
      if (b.durationMonths !== undefined) patch.durationMonths = b.durationMonths;
      if (b.members !== undefined) {
        const others = b.members.filter((m) => m.role !== 'PI' && m.uid !== p.uid);
        const members = [{ uid: p.uid, name: p.displayName, role: 'PI' as const, unitName: rec.unitName }, ...others];
        patch.members = members;
        patch.memberUids = [...new Set(members.map((m) => m.uid).filter((u): u is string => !!u))];
      }
      const version = rec.version + 1;
      tx.update(ref, { ...patch, version, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: 'proposal.update', resourceType: 'proposal', resourceId: id, resourceVersion: version, requestId: rid }, tx);
      return { id, version };
    });
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
    return runTransition<Proposal>({
      principal: p,
      requestId: rid,
      collection: 'proposals',
      resourceType: 'proposal',
      id,
      workflow: PROPOSAL_WORKFLOW,
      body: b,
      idempotencyKey: parseIdempotencyKey(idemKey),
      link: (x) => `/proposals/${x}`,
      titleOf: (r) => `${r.code} — ${r.title || '(chưa đặt tên)'}`,
      flags: (r) => ({ expertReview: r.expertReview }),
      hook: async (tx, rec, to, action) => {
        if (action === 'submit' || action === 'resubmit') {
          const callSnap = await tx.get(tcol(p.tenantId, 'calls').doc(rec.callId));
          const call = docData<Call>(callSnap);
          if (action === 'submit' && !callIsOpen(call)) {
            throw conflict('CALL_CLOSED', 'Đợt đăng ký đã hết hạn nộp hoặc chưa mở.');
          }
          const docsSnap = await tx.get(
            tcol(p.tenantId, 'documents').where('parentId', '==', rec.id).where('status', '==', 'ACTIVE'),
          );
          const docs = docsSnap.docs.map((d) => docData<DocumentMeta>(d)).filter((d) => d.parentType === 'proposal');
          const issues = validateSubmission(call.form, rec.fields, docs.map((d) => d.checklistKey ?? ''), {
            title: rec.title,
            budgetVnd: rec.budgetVnd,
            durationMonths: rec.durationMonths,
          }).filter((i) => i.severity === 'ERROR');
          if (issues.length) throw unprocessable('SUBMISSION_INVALID', 'Hồ sơ chưa đầy đủ, chưa thể nộp.', issues);
          const revisionNo = rec.currentRevisionNo + 1;
          const now = nowIso();
          return {
            patch: { currentRevisionNo: revisionNo, submittedAt: now },
            writes: (t) =>
              t.create(tcol(p.tenantId, 'proposals').doc(rec.id).collection('revisions').doc(String(revisionNo)), {
                revisionNo,
                submittedAt: now,
                submittedBy: p.uid,
                snapshot: {
                  title: rec.title,
                  members: rec.members,
                  fields: rec.fields,
                  budgetVnd: rec.budgetVnd,
                  durationMonths: rec.durationMonths,
                  documentIds: docs.map((d) => d.id),
                },
              }),
          };
        }
        if (action === 'approve') {
          const r = await reserveCode(tx, p.tenantId, 'DT');
          const projectRef = tcol(p.tenantId, 'projects').doc();
          const now = nowIso();
          return {
            patch: { projectId: projectRef.id, decidedAt: now },
            writes: (t) => {
              r.commit();
              t.set(projectRef, {
                tenantId: p.tenantId,
                code: r.code,
                proposalId: rec.id,
                title: rec.title,
                ownerUid: rec.ownerUid,
                ownerName: rec.ownerName,
                memberUids: rec.memberUids ?? [rec.ownerUid],
                members: rec.members,
                unitId: rec.unitId,
                unitPath: rec.unitPath,
                unitName: rec.unitName,
                budgetVnd: rec.budgetVnd,
                durationMonths: rec.durationMonths,
                startDate: null,
                endDate: null,
                status: PROJECT_WORKFLOW.initial,
                workflowKey: 'project',
                workflowVersion: PROJECT_WORKFLOW.version,
                actorsByAction: {},
                returnTo: null,
                milestoneStats: { total: 0, accepted: 0, open: 0, nextDue: null },
                createdAt: now,
                createdBy: p.uid,
                updatedAt: now,
                updatedBy: p.uid,
                version: 1,
              });
              audit({ actor: p, action: 'project.create', resourceType: 'project', resourceId: projectRef.id, resourceVersion: 1, requestId: rid, detail: `từ ${rec.code}` }, t);
            },
          };
        }
        if (to === 'REJECTED' || to === 'WITHDRAWN') return { patch: { decidedAt: nowIso() } };
      },
    });
  }

  /** Trợ lý AI cho hồ sơ: tóm tắt thuyết minh / kiểm tra thuyết minh. Kết quả là dự thảo, lưu kèm người tạo. */
  @Post(':id/ai')
  async ai(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const { task } = parse(z.object({ task: z.enum(['summary', 'check']) }), body);
    const rec = await loadReadable(p, id);
    const call = docData<Call>(await tcol(p.tenantId, 'calls').doc(rec.callId).get());
    let draft;
    if (task === 'summary') {
      draft = await summarizeProposal(p, rec, call.form);
    } else {
      const docs = await tcol(p.tenantId, 'documents').where('parentId', '==', id).where('status', '==', 'ACTIVE').get();
      const keys = docs.docs.filter((d) => d.get('parentType') === 'proposal').map((d) => (d.get('checklistKey') as string) ?? '');
      draft = await checkProposal(p, rec, call.form, keys);
    }
    await tcol(p.tenantId, 'proposals').doc(id).collection('aiDrafts').add({ ...draft, proposalVersion: rec.version, createdBy: p.uid, createdByName: p.displayName });
    await audit({ actor: p, action: `ai.proposal_${task}`, resourceType: 'proposal', resourceId: id, resourceVersion: rec.version, requestId: rid, detail: `${draft.model.provider}/${draft.model.modelId}${draft.mock ? ' (mock)' : ''}` });
    return { ...draft, proposalVersion: rec.version };
  }

  @Get(':id/ai')
  async aiDrafts(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await loadReadable(p, id);
    const snap = await tcol(p.tenantId, 'proposals').doc(id).collection('aiDrafts').orderBy('generatedAt', 'desc').limit(20).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; task: string });
    return { latest: { summary: items.find((x) => x.task === 'summary') ?? null, check: items.find((x) => x.task === 'check') ?? null } };
  }

  @Get(':id/history')
  async history(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await loadReadable(p, id);
    const snap = await tcol(p.tenantId, 'proposals').doc(id).collection('history').orderBy('at', 'asc').get();
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }

  @Get(':id/revisions')
  async revisions(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await loadReadable(p, id);
    const snap = await tcol(p.tenantId, 'proposals').doc(id).collection('revisions').orderBy('revisionNo', 'desc').get();
    return { items: snap.docs.map((d) => d.data()) };
  }
}
