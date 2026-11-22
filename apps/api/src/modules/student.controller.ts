import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  EVALUATION_RESULTS,
  FUNDING_SOURCES,
  hasAnyRole,
  hasRoleFor,
  JOURNAL_SCOPES,
  PROJECT_CLASSIFICATIONS,
  PROJECT_LEVELS,
  QUARTILES,
  SCIENCE_FIELDS,
  SCIENCE_OFFICE,
  STUDENT_PRIZES,
  TENANT_READERS,
  type Call,
  type Principal,
  type Project,
  type Proposal,
  type Publication,
  type StudentPrize,
  type TargetResult,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { audit, canRead, listVisible, notify } from '../common/records';
import { docData, parse } from '../common/util';
import { db, nowIso, tcol } from '../infra';

const enumOf = <T extends Record<string, string>>(m: T) => z.enum(Object.keys(m) as [keyof T & string, ...(keyof T & string)[]]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isOffice = (p: Principal, unitPath: string[] | null = null) => hasRoleFor(p, SCIENCE_OFFICE, unitPath);

/** Thông tin HEMIS của đề tài, phân loại công bố — Phòng KH cập nhật. */
@Controller()
export class HemisDataController {
  @Put('projects/:id/hemis')
  async projectHemis(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(
      z.object({
        classification: enumOf(PROJECT_CLASSIFICATIONS).nullable(),
        level: enumOf(PROJECT_LEVELS).nullable(),
        field: enumOf(SCIENCE_FIELDS).nullable(),
        fundingSource: enumOf(FUNDING_SOURCES).nullable(),
        hostAgency: z.string().max(300).nullable(),
        evaluationResult: enumOf(EVALUATION_RESULTS).nullable(),
        acceptanceDate: dateStr.nullable(),
      }),
      body,
    );
    const ref = tcol(p.tenantId, 'projects').doc(id);
    return db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const rec = docData<Project>(s);
      if (!isOffice(p, rec.unitPath)) throw forbidden('Chỉ Phòng quản lý khoa học cập nhật thông tin HEMIS.');
      const hemis = { ...b, hostAgency: b.hostAgency?.trim() || null, updatedAt: nowIso(), updatedByName: p.displayName };
      tx.update(ref, { hemis, version: rec.version + 1, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: 'project.hemis', resourceType: 'project', resourceId: id, resourceVersion: rec.version + 1, requestId: rid }, tx);
      return { hemis };
    });
  }

  /** Phạm vi tạp chí, xếp hạng Q: cán bộ xác nhận theo nguồn (ghi rõ nguồn) — AI không tự kết luận. */
  @Put('publications/:id/classification')
  async pubClassification(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ journalScope: enumOf(JOURNAL_SCOPES).nullable(), quartile: z.enum(QUARTILES).nullable(), quartileSource: z.string().max(300).nullable() }), body);
    if (b.quartile && !b.quartileSource?.trim()) throw badRequest('Cần ghi nguồn xếp hạng Q (vd: SCImago 2025).');
    const ref = tcol(p.tenantId, 'publications').doc(id);
    return db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const rec = docData<Publication>(s);
      if (!isOffice(p, rec.unitPath)) throw forbidden('Chỉ Phòng quản lý khoa học xác nhận phân loại tạp chí.');
      if (rec.ownerUid === p.uid) throw forbidden('Không tự xác nhận công bố của chính mình.', 'SELF_REVIEW');
      tx.update(ref, { journalScope: b.journalScope, quartile: b.quartile, quartileSource: b.quartileSource?.trim() || null, version: rec.version + 1, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: 'publication.classification', resourceType: 'publication', resourceId: id, resourceVersion: rec.version + 1, requestId: rid, detail: `${b.journalScope ?? '-'} ${b.quartile ?? '-'}` }, tx);
      return { id, journalScope: b.journalScope, quartile: b.quartile };
    });
  }
}

interface SupervisionLog {
  id: string;
  date: string;
  content: string;
  nextSteps: string | null;
  byUid: string;
  byName: string;
  createdAt: string;
}

@Controller()
export class StudentResearchController {
  /** Sinh viên chọn giảng viên hướng dẫn, khai ngành / khóa (khi hồ sơ còn sửa được). */
  @Put('proposals/:id/student')
  async setStudent(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ supervisorUid: z.string().max(128).nullable(), major: z.string().max(200).nullable(), cohort: z.string().max(50).nullable() }), body);
    const ref = tcol(p.tenantId, 'proposals').doc(id);
    let supervisorName: string | null = null;
    if (b.supervisorUid) {
      if (b.supervisorUid === p.uid) throw badRequest('Không tự chọn mình làm người hướng dẫn.');
      const person = await tcol(p.tenantId, 'people').doc(b.supervisorUid).get();
      if (!person.exists || person.get('status') !== 'ACTIVE') throw badRequest('Không tìm thấy giảng viên hướng dẫn.');
      const roles = await tcol(p.tenantId, 'roleBindings').where('uid', '==', b.supervisorUid).get();
      if (!roles.docs.some((d) => ['SUPERVISOR', 'RESEARCHER'].includes(d.get('role')))) throw badRequest('Người được chọn không phải giảng viên / người hướng dẫn.');
      supervisorName = person.get('displayName');
    }
    const out = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const rec = docData<Proposal>(s);
      if (rec.ownerUid !== p.uid || !['DRAFT', 'NEEDS_REVISION'].includes(rec.status)) throw forbidden('Chỉ chủ nhiệm sửa khi hồ sơ ở trạng thái Nháp hoặc Cần bổ sung.');
      const same = rec.supervisor?.uid === b.supervisorUid;
      const supervisor = b.supervisorUid ? (same ? rec.supervisor! : { uid: b.supervisorUid, name: supervisorName!, confirmedAt: null, note: null }) : null;
      const memberUids = [...new Set([...rec.members.map((m) => m.uid), supervisor?.uid].filter((u): u is string => !!u))];
      tx.update(ref, { supervisor, major: b.major?.trim() || null, cohort: b.cohort?.trim() || null, memberUids, version: rec.version + 1, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: 'proposal.student_info', resourceType: 'proposal', resourceId: id, resourceVersion: rec.version + 1, requestId: rid }, tx);
      return { rec, supervisor, changed: !same };
    });
    if (out.supervisor && out.changed) {
      await notify(p.tenantId, [out.supervisor.uid], { title: 'Đề nghị xác nhận hướng dẫn NCKH sinh viên', body: `${out.rec.code} — ${out.rec.title || '(chưa đặt tên)'} (${p.displayName})`, link: `/proposals/${id}` }).catch(() => undefined);
    }
    return { supervisor: out.supervisor };
  }

  /** Giảng viên hướng dẫn xác nhận / từ chối hướng dẫn. */
  @Post('proposals/:id/supervisor/:action')
  async supervisorAct(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    if (action !== 'confirm' && action !== 'decline') throw notFound();
    const b = parse(z.object({ note: z.string().max(1000).optional() }), body);
    const ref = tcol(p.tenantId, 'proposals').doc(id);
    const rec = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const rec = docData<Proposal>(s);
      if (rec.supervisor?.uid !== p.uid) throw forbidden('Bạn không phải người hướng dẫn của hồ sơ này.');
      if (!['DRAFT', 'NEEDS_REVISION'].includes(rec.status)) throw conflict('INVALID_STATE', 'Hồ sơ đã nộp.');
      const supervisor =
        action === 'confirm' ? { ...rec.supervisor, confirmedAt: nowIso(), note: b.note ?? null } : null;
      const memberUids = action === 'confirm' ? rec.memberUids : rec.memberUids.filter((u) => u !== p.uid || rec.members.some((m) => m.uid === u));
      tx.update(ref, { supervisor, memberUids, version: rec.version + 1, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: `proposal.supervisor_${action}`, resourceType: 'proposal', resourceId: id, resourceVersion: rec.version + 1, requestId: rid, detail: b.note ?? null }, tx);
      return rec;
    });
    await notify(p.tenantId, [rec.ownerUid], { title: action === 'confirm' ? 'Giảng viên đã xác nhận hướng dẫn' : 'Giảng viên từ chối hướng dẫn', body: `${rec.code}${b.note ? ` — ${b.note}` : ''}`, link: `/proposals/${id}` }).catch(() => undefined);
    return { ok: true };
  }

  @Get('projects/:id/supervision-logs')
  async logs(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const s = await tcol(p.tenantId, 'projects').doc(id).get();
    if (!s.exists) throw notFound();
    const rec = docData<Project>(s);
    if (!canRead(p, rec)) throw notFound();
    const snap = await tcol(p.tenantId, 'projects').doc(id).collection('supervisionLogs').get();
    const items = snap.docs.map((d) => docData<SupervisionLog>(d)).sort((a, b) => (a.date < b.date ? 1 : -1));
    return { items, canWrite: rec.ownerUid === p.uid || rec.memberUids.includes(p.uid) || rec.supervisor?.uid === p.uid };
  }

  @Post('projects/:id/supervision-logs')
  async addLog(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: dateStr, content: z.string().min(3).max(3000), nextSteps: z.string().max(2000).nullable().optional() }), body);
    const s = await tcol(p.tenantId, 'projects').doc(id).get();
    if (!s.exists) throw notFound();
    const rec = docData<Project>(s);
    if (!(rec.ownerUid === p.uid || rec.memberUids.includes(p.uid) || rec.supervisor?.uid === p.uid)) throw forbidden('Chỉ nhóm thực hiện hoặc người hướng dẫn ghi nhật ký.');
    const ref = await tcol(p.tenantId, 'projects').doc(id).collection('supervisionLogs').add({ date: b.date, content: b.content.trim(), nextSteps: b.nextSteps?.trim() || null, byUid: p.uid, byName: p.displayName, createdAt: nowIso() });
    await audit({ actor: p, action: 'project.supervision_log', resourceType: 'project', resourceId: id, requestId: rid });
    return { id: ref.id };
  }

  /** Đề tài sinh viên của một đợt kèm điểm hội đồng (nếu có) và giải đã xếp. */
  @Get('student-research/calls/:callId/ranking')
  async ranking(@CurrentPrincipal() p: Principal, @Param('callId') callId: string) {
    if (!hasAnyRole(p, [...SCIENCE_OFFICE, ...TENANT_READERS, 'UNIT_FOCAL', 'UNIT_HEAD'])) throw forbidden();
    const call = await tcol(p.tenantId, 'calls').doc(callId).get();
    if (!call.exists) throw notFound();
    const c = docData<Call>(call);
    if (c.level !== 'STUDENT') throw badRequest('Đợt này không phải NCKH sinh viên.');
    const proposals = (await listVisible<Proposal>(p, 'proposals', { limit: 1000 })).filter((x) => x.callId === callId && !['DRAFT', 'WITHDRAWN'].includes(x.status));
    const councils = await tcol(p.tenantId, 'councils').where('type', '==', 'STUDENT_AWARD').get();
    const results = new Map<string, TargetResult & { councilCode: string }>();
    for (const d of councils.docs) for (const r of (d.get('results') as TargetResult[] | undefined) ?? []) results.set(r.targetId, { ...r, councilCode: d.get('code') });
    const awards = new Map((await tcol(p.tenantId, 'studentAwards').where('callId', '==', callId).get()).docs.map((d) => [d.get('proposalId') as string, d.data()]));
    const items = proposals
      .map((x) => {
        const r = results.get(x.id) ?? (x.projectId ? results.get(x.projectId) : undefined);
        const a = awards.get(x.id);
        return {
          proposalId: x.id,
          code: x.code,
          title: x.title,
          ownerName: x.ownerName,
          unitName: x.unitName,
          major: x.major ?? null,
          cohort: x.cohort ?? null,
          supervisorName: x.supervisor?.name ?? null,
          status: x.status,
          councilCode: r?.councilCode ?? null,
          average: r?.average ?? null,
          suggestion: r?.suggestion ?? null,
          prize: (a?.prize as StudentPrize | undefined) ?? null,
          prizeNote: (a?.note as string | undefined) ?? null,
        };
      })
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
    return { call: { id: c.id, code: c.code, title: c.title, year: c.year }, items, canAward: isOffice(p), note: 'Xếp theo điểm trung bình của hội đồng (công thức). Mức giải do Phòng KH ghi theo quyết định của hội đồng / Hiệu trưởng.' };
  }

  @Put('student-research/awards')
  async award(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!isOffice(p)) throw forbidden('Chỉ Phòng quản lý khoa học ghi nhận giải.');
    const b = parse(z.object({ proposalId: z.string().min(1).max(128), prize: enumOf(STUDENT_PRIZES), decisionNo: z.string().max(100).nullable().optional(), note: z.string().max(1000).nullable().optional() }), body);
    const s = await tcol(p.tenantId, 'proposals').doc(b.proposalId).get();
    if (!s.exists) throw notFound();
    const rec = docData<Proposal>(s);
    if (rec.callLevel !== 'STUDENT') {
      const call = await tcol(p.tenantId, 'calls').doc(rec.callId).get();
      if (call.get('level') !== 'STUDENT') throw badRequest('Hồ sơ không thuộc đợt NCKH sinh viên.');
    }
    await tcol(p.tenantId, 'studentAwards').doc(b.proposalId).set({
      proposalId: b.proposalId,
      callId: rec.callId,
      prize: b.prize,
      decisionNo: b.decisionNo ?? null,
      note: b.note ?? null,
      unitName: rec.unitName,
      major: rec.major ?? null,
      cohort: rec.cohort ?? null,
      year: Number(String(rec.createdAt).slice(0, 4)),
      updatedAt: nowIso(),
      updatedByName: p.displayName,
    });
    await audit({ actor: p, action: 'student.award', resourceType: 'proposal', resourceId: b.proposalId, requestId: rid, detail: b.prize });
    if (b.prize !== 'NONE') await notify(p.tenantId, rec.memberUids, { title: `Đề tài đạt ${STUDENT_PRIZES[b.prize]}`, body: `${rec.code} — ${rec.title}`, link: `/proposals/${rec.id}` }).catch(() => undefined);
    return { ok: true };
  }

  /** Thống kê NCKH sinh viên theo khoa / ngành / khóa / năm. */
  @Get('student-research/stats')
  async stats(@CurrentPrincipal() p: Principal, @Query('year') year?: string) {
    const calls = (await tcol(p.tenantId, 'calls').where('level', '==', 'STUDENT').get()).docs.map((d) => docData<Call>(d));
    const callIds = new Set(calls.filter((c) => !year || String(c.year) === year).map((c) => c.id));
    const proposals = (await listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 })).filter((x) => callIds.has(x.callId) && x.status !== 'WITHDRAWN');
    const awards = new Map((await tcol(p.tenantId, 'studentAwards').get()).docs.map((d) => [d.get('proposalId') as string, d.get('prize') as StudentPrize]));
    const group = (key: (x: Proposal) => string) => {
      const m = new Map<string, { key: string; proposals: number; submitted: number; approved: number; awarded: number }>();
      for (const x of proposals) {
        const k = key(x) || '(chưa khai)';
        if (!m.has(k)) m.set(k, { key: k, proposals: 0, submitted: 0, approved: 0, awarded: 0 });
        const r = m.get(k)!;
        r.proposals++;
        if (x.status !== 'DRAFT') r.submitted++;
        if (x.status === 'APPROVED') r.approved++;
        const a = awards.get(x.id);
        if (a && a !== 'NONE') r.awarded++;
      }
      return [...m.values()].sort((a, b) => b.proposals - a.proposals || a.key.localeCompare(b.key, 'vi'));
    };
    const prizes = Object.fromEntries(Object.keys(STUDENT_PRIZES).map((k) => [k, 0])) as Record<StudentPrize, number>;
    for (const x of proposals) {
      const a = awards.get(x.id);
      if (a) prizes[a]++;
    }
    return {
      years: [...new Set(calls.map((c) => c.year))].sort((a, b) => b - a),
      total: proposals.length,
      supervisorConfirmed: proposals.filter((x) => x.supervisor?.confirmedAt).length,
      byUnit: group((x) => x.unitName),
      byMajor: group((x) => x.major ?? ''),
      byCohort: group((x) => x.cohort ?? ''),
      byYear: group((x) => String(calls.find((c) => c.id === x.callId)?.year ?? '')),
      prizes,
      items: proposals.map((x) => ({ id: x.id, code: x.code, title: x.title, ownerName: x.ownerName, unitName: x.unitName, major: x.major ?? null, cohort: x.cohort ?? null, supervisorName: x.supervisor?.name ?? null, supervisorConfirmed: !!x.supervisor?.confirmedAt, status: x.status, callId: x.callId, prize: awards.get(x.id) ?? null })),
    };
  }
}
