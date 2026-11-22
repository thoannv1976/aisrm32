import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  aggregate,
  COUNCIL_ROLE_LABELS,
  COUNCIL_TYPE_LABELS,
  hasRoleFor,
  rubricMax,
  RUBRIC_TEMPLATES,
  SCIENCE_OFFICE,
  sheetTotal,
  validateScores,
  type CouncilMember,
  type CouncilRole,
  type CouncilStatus,
  type CouncilTarget,
  type CouncilType,
  type Principal,
  type ReviewSheet,
  type Rubric,
  type TargetResult,
} from '@aisrm/shared';
import { z } from 'zod';
import { draftMinutes } from '../ai/features';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { db, nowIso, tcol } from '../infra';
import { audit, canRead, notify, reserveCode } from '../common/records';
import { parse } from '../common/util';
import { suggestReviewers } from '../council/suggest';

interface Council {
  id: string;
  code: string;
  title: string;
  type: CouncilType;
  rubric: Rubric;
  targets: CouncilTarget[];
  members: CouncilMember[];
  memberUids: string[];
  status: CouncilStatus;
  scoringDeadline: string | null;
  results: TargetResult[] | null;
  minutes: { text: string; updatedAt: string; updatedByName: string; aiDraft?: unknown } | null;
  conclusions: Record<string, { decision: 'APPROVE' | 'REVISE' | 'REJECT'; note: string }> | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  version: number;
  createdAt: string;
  createdByName: string;
}

const isOffice = (p: Principal) => hasRoleFor(p, SCIENCE_OFFICE, null);
const memberOf = (c: Council, uid: string) => c.members.find((m) => m.uid === uid);
const hasRole = (c: Council, uid: string, ...roles: CouncilRole[]) => {
  const m = memberOf(c, uid);
  return !!m && m.status === 'ACCEPTED' && roles.includes(m.role);
};

async function load(p: Principal, id: string): Promise<Council> {
  const s = await tcol(p.tenantId, 'councils').doc(id).get();
  if (!s.exists) throw notFound();
  const c = { id: s.id, ...s.data() } as Council;
  if (!isOffice(p) && !c.memberUids.includes(p.uid)) throw notFound();
  return c;
}

/** Thành viên đủ điều kiện chấm một hồ sơ: đã nhận lời, đã khai báo không xung đột với hồ sơ đó. */
const eligibleFor = (c: Council, targetId: string) => c.members.filter((m) => m.status === 'ACCEPTED' && m.coi[targetId] && !m.coi[targetId].hasConflict);

async function setAccess(tenantId: string, uid: string, targetId: string, councilId: string, active: boolean, until: string | null) {
  await tcol(tenantId, 'reviewAccess').doc(`${uid}__${targetId}`).set({ uid, targetId, councilId, active, until, updatedAt: nowIso() });
}

const targetSchema = z.object({ type: z.enum(['proposal', 'project']), id: z.string().min(1).max(128) });

@Controller('councils')
export class CouncilsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal) {
    const col = tcol(p.tenantId, 'councils');
    const snap = isOffice(p) ? await col.orderBy('createdAt', 'desc').limit(200).get() : await col.where('memberUids', 'array-contains', p.uid).limit(200).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Council).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      canManage: isOffice(p),
      rubrics: RUBRIC_TEMPLATES,
      items: items.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        type: c.type,
        status: c.status,
        targets: c.targets.length,
        members: c.members.length,
        myRole: memberOf(c, p.uid)?.role ?? null,
        myStatus: memberOf(c, p.uid)?.status ?? null,
        scoringDeadline: c.scoringDeadline,
        createdAt: c.createdAt,
      })),
    };
  }

  /** Gợi ý phản biện cho một hồ sơ (chỉ Phòng KH). */
  @Get('suggest-reviewers')
  async suggest(@CurrentPrincipal() p: Principal, @Query('type') type: string, @Query('id') id: string) {
    if (!isOffice(p)) throw forbidden();
    const t = parse(targetSchema, { type, id });
    const s = await tcol(p.tenantId, t.type === 'proposal' ? 'proposals' : 'projects').doc(t.id).get();
    if (!s.exists) throw notFound();
    const d = s.data()!;
    const fields = (d.fields ?? {}) as Record<string, unknown>;
    const text = [d.title, fields.field, fields.objective, fields.methods, fields.urgency].filter(Boolean).join('. ');
    const items = await suggestReviewers(p.tenantId, { ownerUid: d.ownerUid, memberUids: d.memberUids ?? [], unitId: d.unitId, text });
    return { items, method: 'Đối sánh từ khóa có trọng số giữa hồ sơ và chuyên môn khai báo, hướng nghiên cứu, công bố đã xác nhận. Là gợi ý — người có thẩm quyền quyết định.' };
  }

  @Post()
  async create(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!isOffice(p)) throw forbidden('Chỉ Phòng quản lý khoa học được thành lập hội đồng.');
    const b = parse(
      z.object({
        title: z.string().min(3).max(300),
        type: z.enum(['PROPOSAL_REVIEW', 'STUDENT_AWARD', 'ACCEPTANCE']),
        rubricTemplateKey: z.string(),
        targets: z.array(targetSchema).min(1).max(30),
        scoringDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }),
      body,
    );
    const rubric = RUBRIC_TEMPLATES.find((r) => r.templateKey === b.rubricTemplateKey);
    if (!rubric) throw badRequest('Mẫu phiếu không tồn tại.');
    const targets: CouncilTarget[] = [];
    for (const t of b.targets) {
      const s = await tcol(p.tenantId, t.type === 'proposal' ? 'proposals' : 'projects').doc(t.id).get();
      if (!s.exists) throw notFound(`Không tìm thấy hồ sơ ${t.id}.`);
      const d = s.data()!;
      if (!canRead(p, { ownerUid: d.ownerUid, unitPath: d.unitPath, memberUids: d.memberUids })) throw notFound();
      if (targets.some((x) => x.id === s.id)) continue;
      targets.push({ id: s.id, type: t.type, code: d.code, title: d.title, ownerUid: d.ownerUid, ownerName: d.ownerName, unitName: d.unitName });
    }
    const ref = tcol(p.tenantId, 'councils').doc();
    const code = await db().runTransaction(async (tx) => {
      const r = await reserveCode(tx, p.tenantId, 'HD');
      r.commit();
      tx.set(ref, {
        code: r.code,
        title: b.title,
        type: b.type,
        rubric,
        targets,
        members: [],
        memberUids: [],
        status: 'SETUP',
        scoringDeadline: b.scoringDeadline ?? null,
        results: null,
        minutes: null,
        conclusions: null,
        confirmedAt: null,
        confirmedByName: null,
        version: 1,
        createdAt: nowIso(),
        createdBy: p.uid,
        createdByName: p.displayName,
      });
      audit({ actor: p, action: 'council.create', resourceType: 'council', resourceId: ref.id, resourceVersion: 1, requestId: rid, detail: `${targets.length} hồ sơ` }, tx);
      return r.code;
    });
    return { id: ref.id, code };
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const c = await load(p, id);
    const me = memberOf(c, p.uid);
    const sheetsSnap = await tcol(p.tenantId, 'councils').doc(id).collection('sheets').get();
    const sheets = sheetsSnap.docs.map((d) => d.data() as ReviewSheet);
    const closed = c.status === 'SCORING_CLOSED' || c.status === 'MINUTES_CONFIRMED';
    const leader = isOffice(p) || hasRole(c, p.uid, 'CHAIR', 'SECRETARY');
    const progress = c.targets.map((t) => ({
      targetId: t.id,
      eligible: eligibleFor(c, t.id).length,
      submitted: sheets.filter((s) => s.targetId === t.id && s.status === 'SUBMITTED').length,
    }));
    return {
      item: c,
      me: me ?? null,
      permissions: {
        manage: isOffice(p),
        chair: hasRole(c, p.uid, 'CHAIR'),
        secretary: hasRole(c, p.uid, 'SECRETARY'),
        canScore: !!me && me.status === 'ACCEPTED' && c.status === 'SCORING',
      },
      progress,
      mySheets: sheets.filter((s) => s.memberUid === p.uid),
      // Phiếu của người khác chỉ hiển thị sau khi khóa phiếu, cho lãnh đạo hội đồng và Phòng KH (chấm độc lập).
      allSheets: closed && leader ? sheets : null,
      maxTotal: rubricMax(c.rubric),
      typeLabel: COUNCIL_TYPE_LABELS[c.type],
    };
  }

  @Post(':id/members')
  async addMember(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    if (!isOffice(p)) throw forbidden();
    const b = parse(z.object({ uid: z.string().min(1).max(128), role: z.enum(['CHAIR', 'SECRETARY', 'REVIEWER', 'MEMBER']) }), body);
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const person = await tcol(p.tenantId, 'people').doc(b.uid).get();
    if (!person.exists || person.get('status') !== 'ACTIVE') throw notFound('Không tìm thấy người dùng.');
    const unit = person.get('unitId') ? await tcol(p.tenantId, 'units').doc(person.get('unitId')).get() : null;
    const result = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      if (!['SETUP', 'SCORING'].includes(c.status)) throw conflict('INVALID_STATE', 'Hội đồng đã khóa phiếu; không thêm thành viên.');
      if (memberOf(c, b.uid)) throw conflict('DUPLICATE', 'Người này đã có trong hội đồng.');
      if ((b.role === 'CHAIR' || b.role === 'SECRETARY') && c.members.some((m) => m.role === b.role && m.status !== 'DECLINED')) {
        throw conflict('DUPLICATE_ROLE', `Hội đồng đã có ${COUNCIL_ROLE_LABELS[b.role].toLowerCase()}.`);
      }
      // Xung đột hiển nhiên: là chủ nhiệm hồ sơ → hệ thống tự ghi nhận, không được chấm hồ sơ đó.
      const coi: CouncilMember['coi'] = {};
      for (const t of c.targets) {
        if (t.ownerUid === b.uid) coi[t.id] = { hasConflict: true, note: 'Hệ thống: là chủ nhiệm hồ sơ', declaredAt: nowIso() };
      }
      const member: CouncilMember = { uid: b.uid, name: person.get('displayName'), unitName: unit?.get('name') ?? null, role: b.role, status: 'INVITED', coi, respondedAt: null };
      tx.update(ref, { members: [...c.members, member], memberUids: [...c.memberUids, b.uid], version: c.version + 1 });
      audit({ actor: p, action: 'council.member_add', resourceType: 'council', resourceId: id, resourceVersion: c.version + 1, requestId: rid, detail: `${member.name} — ${b.role}` }, tx);
      return { code: c.code, title: c.title, member };
    });
    await notify(p.tenantId, [b.uid], { title: `Mời tham gia hội đồng ${result.code}`, body: `${result.title} — vai trò ${COUNCIL_ROLE_LABELS[b.role]}. Vui lòng xác nhận tham gia.`, link: `/councils/${id}` }).catch(() => undefined);
    return result.member;
  }

  @Delete(':id/members/:uid')
  async removeMember(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Param('uid') uid: string) {
    if (!isOffice(p)) throw forbidden();
    const ref = tcol(p.tenantId, 'councils').doc(id);
    return db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      if (c.status !== 'SETUP') throw conflict('INVALID_STATE', 'Chỉ bỏ thành viên khi hội đồng đang thành lập.');
      tx.update(ref, { members: c.members.filter((m) => m.uid !== uid), memberUids: c.memberUids.filter((u) => u !== uid), version: c.version + 1 });
      audit({ actor: p, action: 'council.member_remove', resourceType: 'council', resourceId: id, requestId: rid, detail: uid }, tx);
      return { removed: uid };
    });
  }

  /** Thành viên nhận lời / từ chối tham gia. */
  @Post(':id/respond')
  async respond(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const { accept } = parse(z.object({ accept: z.boolean() }), body);
    const ref = tcol(p.tenantId, 'councils').doc(id);
    return db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      const m = memberOf(c, p.uid);
      if (!m) throw notFound();
      if (c.status === 'SCORING_CLOSED' || c.status === 'MINUTES_CONFIRMED') throw conflict('INVALID_STATE', 'Hội đồng đã khóa phiếu.');
      const members = c.members.map((x) => (x.uid === p.uid ? { ...x, status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: nowIso() } : x));
      tx.update(ref, { members, version: c.version + 1 });
      audit({ actor: p, action: accept ? 'council.accept' : 'council.decline', resourceType: 'council', resourceId: id, requestId: rid }, tx);
      return { status: accept ? 'ACCEPTED' : 'DECLINED' };
    });
  }

  /**
   * Khai báo xung đột lợi ích cho từng hồ sơ (trước khi được xem hồ sơ). Không xung đột → được cấp quyền xem hồ sơ
   * trong thời gian chấm; có xung đột → không xem, không chấm hồ sơ đó.
   */
  @Post(':id/coi')
  async declareCoi(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ targetId: z.string().min(1), hasConflict: z.boolean(), note: z.string().max(1000).optional().nullable() }), body);
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const c = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      const m = memberOf(c, p.uid);
      if (!m) throw notFound();
      if (m.status !== 'ACCEPTED') throw conflict('NOT_ACCEPTED', 'Cần xác nhận tham gia hội đồng trước.');
      if (!c.targets.some((t) => t.id === b.targetId)) throw notFound('Hồ sơ không thuộc hội đồng.');
      if (c.status === 'SCORING_CLOSED' || c.status === 'MINUTES_CONFIRMED') throw conflict('INVALID_STATE', 'Hội đồng đã khóa phiếu.');
      const prev = m.coi[b.targetId];
      if (prev?.hasConflict && prev.note?.startsWith('Hệ thống')) throw conflict('SYSTEM_CONFLICT', 'Bạn là chủ nhiệm hồ sơ này — không thể chấm.');
      const sheet = await tx.get(ref.collection('sheets').doc(`${p.uid}__${b.targetId}`));
      if (sheet.exists && sheet.get('status') === 'SUBMITTED') throw conflict('ALREADY_SUBMITTED', 'Đã nộp phiếu cho hồ sơ này.');
      if (b.hasConflict && !b.note?.trim()) throw unprocessable('COMMENT_REQUIRED', 'Cần mô tả quan hệ / xung đột lợi ích.');
      const members = c.members.map((x) => (x.uid === p.uid ? { ...x, coi: { ...x.coi, [b.targetId]: { hasConflict: b.hasConflict, note: b.note?.trim() || null, declaredAt: nowIso() } } } : x));
      tx.update(ref, { members, version: c.version + 1 });
      audit({ actor: p, action: 'council.coi', resourceType: 'council', resourceId: id, requestId: rid, detail: `${b.targetId}: ${b.hasConflict ? 'có xung đột' : 'không xung đột'}` }, tx);
      return c;
    });
    const until = c.scoringDeadline ? new Date(`${c.scoringDeadline}T23:59:59+07:00`).toISOString() : null;
    await setAccess(p.tenantId, p.uid, b.targetId, id, !b.hasConflict, until);
    return { targetId: b.targetId, hasConflict: b.hasConflict, access: !b.hasConflict };
  }

  /** Mở chấm: cần chủ tịch, thư ký đã nhận lời. */
  @Post(':id/open')
  async open(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    if (!isOffice(p)) throw forbidden();
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const c = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      if (c.status !== 'SETUP') throw conflict('INVALID_STATE', 'Hội đồng không ở trạng thái thành lập.');
      const missing = (['CHAIR', 'SECRETARY'] as const).filter((r) => !c.members.some((m) => m.role === r && m.status === 'ACCEPTED'));
      if (missing.length) throw unprocessable('ROLES_MISSING', `Chưa có ${missing.map((r) => COUNCIL_ROLE_LABELS[r].toLowerCase()).join(', ')} đã nhận lời.`);
      tx.update(ref, { status: 'SCORING', version: c.version + 1, openedAt: nowIso() });
      audit({ actor: p, action: 'council.open', resourceType: 'council', resourceId: id, resourceVersion: c.version + 1, requestId: rid }, tx);
      return c;
    });
    await notify(p.tenantId, c.members.filter((m) => m.status === 'ACCEPTED').map((m) => m.uid), { title: `Hội đồng ${c.code} bắt đầu chấm`, body: 'Khai báo xung đột lợi ích cho từng hồ sơ trước khi xem và chấm.', link: `/councils/${id}` }).catch(() => undefined);
    return { status: 'SCORING' };
  }

  /** Lưu nháp / nộp phiếu chấm. Phiếu đã nộp bị khóa. */
  @Put(':id/sheets/:targetId')
  async saveSheet(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Param('targetId') targetId: string, @Body() body: unknown) {
    const b = parse(z.object({ scores: z.record(z.string(), z.number()), comment: z.string().max(5000).default(''), submit: z.boolean().default(false) }), body);
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const sheetRef = ref.collection('sheets').doc(`${p.uid}__${targetId}`);
    return db().runTransaction(async (tx) => {
      const [s, existing] = await Promise.all([tx.get(ref), tx.get(sheetRef)]);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      const m = memberOf(c, p.uid);
      if (!m || m.status !== 'ACCEPTED') throw forbidden('Bạn không phải thành viên đã nhận lời của hội đồng.');
      if (c.status !== 'SCORING') throw conflict('INVALID_STATE', 'Hội đồng không trong thời gian chấm.');
      if (!c.targets.some((t) => t.id === targetId)) throw notFound();
      const coi = m.coi[targetId];
      if (!coi) throw unprocessable('COI_REQUIRED', 'Cần khai báo xung đột lợi ích trước khi chấm.');
      if (coi.hasConflict) throw forbidden('Bạn đã khai báo xung đột lợi ích với hồ sơ này — không được chấm.', 'CONFLICT_OF_INTEREST');
      if (existing.exists && existing.get('status') === 'SUBMITTED') throw conflict('ALREADY_SUBMITTED', 'Phiếu đã nộp và đã khóa.');
      if (b.submit) {
        const errors = validateScores(c.rubric, b.scores);
        if (errors.length) throw unprocessable('INVALID_SCORES', 'Phiếu chấm chưa hợp lệ.', errors.map((message) => ({ message })));
      }
      const now = nowIso();
      const sheet: ReviewSheet = {
        memberUid: p.uid,
        memberName: p.displayName,
        targetId,
        scores: b.scores,
        comment: b.comment,
        total: sheetTotal(c.rubric, b.scores),
        status: b.submit ? 'SUBMITTED' : 'DRAFT',
        submittedAt: b.submit ? now : null,
        updatedAt: now,
      };
      tx.set(sheetRef, sheet);
      if (b.submit) audit({ actor: p, action: 'council.sheet_submit', resourceType: 'council', resourceId: id, requestId: rid, detail: targetId }, tx);
      return sheet;
    });
  }

  /** Khóa phiếu và tổng hợp (chủ tịch hoặc Phòng KH). */
  @Post(':id/close')
  async close(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const c = await db().runTransaction(async (tx) => {
      const [s, sheetsSnap] = await Promise.all([tx.get(ref), tx.get(ref.collection('sheets'))]);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      if (!isOffice(p) && !hasRole(c, p.uid, 'CHAIR')) throw forbidden('Chỉ chủ tịch hội đồng hoặc Phòng KH được khóa phiếu.');
      if (c.status !== 'SCORING') throw conflict('INVALID_STATE', 'Hội đồng không trong thời gian chấm.');
      const sheets = sheetsSnap.docs.map((d) => d.data() as ReviewSheet);
      const results = c.targets.map((t) => aggregate(c.rubric, t, sheets, eligibleFor(c, t.id).length));
      tx.update(ref, { status: 'SCORING_CLOSED', results, closedAt: nowIso(), version: c.version + 1 });
      audit({ actor: p, action: 'council.close', resourceType: 'council', resourceId: id, resourceVersion: c.version + 1, requestId: rid, detail: results.map((r) => `${r.code}: ${r.average ?? '—'}`).join('; ') }, tx);
      return c;
    });
    const leaders = c.members.filter((m) => m.status === 'ACCEPTED' && (m.role === 'CHAIR' || m.role === 'SECRETARY')).map((m) => m.uid);
    await notify(p.tenantId, leaders, { title: `Hội đồng ${c.code} đã khóa phiếu`, body: 'Thư ký dự thảo biên bản, chủ tịch xác nhận kết luận.', link: `/councils/${id}` }).catch(() => undefined);
    return { status: 'SCORING_CLOSED' };
  }

  /** AI dự thảo biên bản từ kết quả và nhận xét (thư ký hoặc Phòng KH). */
  @Post(':id/minutes/draft')
  async draft(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const c = await load(p, id);
    if (!isOffice(p) && !hasRole(c, p.uid, 'SECRETARY', 'CHAIR')) throw forbidden();
    if (c.status !== 'SCORING_CLOSED') throw conflict('INVALID_STATE', 'Cần khóa phiếu trước khi dự thảo biên bản.');
    const sheets = (await tcol(p.tenantId, 'councils').doc(id).collection('sheets').where('status', '==', 'SUBMITTED').get()).docs.map((d) => d.data() as ReviewSheet);
    const codeOf = new Map(c.targets.map((t) => [t.id, t.code]));
    const draft = await draftMinutes(p, {
      councilCode: c.code,
      councilTitle: c.title,
      typeLabel: COUNCIL_TYPE_LABELS[c.type],
      rubricName: c.rubric.name,
      passThreshold: c.rubric.passThreshold,
      maxTotal: rubricMax(c.rubric),
      members: c.members.map((m) => ({ name: m.name, roleLabel: COUNCIL_ROLE_LABELS[m.role], status: m.status })),
      results: (c.results ?? []).map((r) => ({ code: r.code, title: r.title, submitted: r.submitted, eligible: r.eligible, average: r.average, min: r.min, max: r.max, suggestion: r.suggestion })),
      comments: sheets.map((s) => ({ targetCode: codeOf.get(s.targetId) ?? s.targetId, comment: s.comment })),
    });
    await tcol(p.tenantId, 'councils').doc(id).update({ minutes: { text: draft.text, updatedAt: nowIso(), updatedByName: p.displayName, aiDraft: { model: draft.model, mock: draft.mock, generatedAt: draft.generatedAt } } });
    await audit({ actor: p, action: 'ai.meeting_minutes', resourceType: 'council', resourceId: id, requestId: rid, detail: draft.mock ? 'mock' : `${draft.model.provider}/${draft.model.modelId}` });
    return draft;
  }

  /** Thư ký lưu biên bản và kết luận (dự thảo). */
  @Put(':id/minutes')
  async saveMinutes(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(
      z.object({
        text: z.string().min(10).max(50000),
        conclusions: z.record(z.string(), z.object({ decision: z.enum(['APPROVE', 'REVISE', 'REJECT']), note: z.string().max(2000).default('') })),
      }),
      body,
    );
    const c = await load(p, id);
    if (!isOffice(p) && !hasRole(c, p.uid, 'SECRETARY', 'CHAIR')) throw forbidden();
    if (c.status !== 'SCORING_CLOSED') throw conflict('INVALID_STATE', 'Biên bản chỉ sửa khi đã khóa phiếu và chưa xác nhận.');
    const unknown = Object.keys(b.conclusions).filter((k) => !c.targets.some((t) => t.id === k));
    if (unknown.length) throw badRequest('Kết luận cho hồ sơ không thuộc hội đồng.');
    await tcol(p.tenantId, 'councils').doc(id).update({ minutes: { ...(c.minutes ?? {}), text: b.text, updatedAt: nowIso(), updatedByName: p.displayName }, conclusions: b.conclusions });
    await audit({ actor: p, action: 'council.minutes_save', resourceType: 'council', resourceId: id, requestId: rid });
    return { saved: true };
  }

  /** Chủ tịch xác nhận biên bản: khóa biên bản, thu hồi quyền xem hồ sơ của thành viên. */
  @Post(':id/minutes/confirm')
  async confirm(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const ref = tcol(p.tenantId, 'councils').doc(id);
    const c = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw notFound();
      const c = { id: s.id, ...s.data() } as Council;
      if (!hasRole(c, p.uid, 'CHAIR')) throw forbidden('Chỉ chủ tịch hội đồng xác nhận biên bản.');
      if (c.status !== 'SCORING_CLOSED') throw conflict('INVALID_STATE', 'Hội đồng chưa khóa phiếu hoặc đã xác nhận.');
      if (!c.minutes?.text) throw unprocessable('MINUTES_REQUIRED', 'Chưa có nội dung biên bản.');
      const missing = c.targets.filter((t) => !c.conclusions?.[t.id]);
      if (missing.length) throw unprocessable('CONCLUSIONS_REQUIRED', `Chưa có kết luận cho: ${missing.map((t) => t.code).join(', ')}.`);
      tx.update(ref, { status: 'MINUTES_CONFIRMED', confirmedAt: nowIso(), confirmedBy: p.uid, confirmedByName: p.displayName, version: c.version + 1 });
      audit({ actor: p, action: 'council.minutes_confirm', resourceType: 'council', resourceId: id, resourceVersion: c.version + 1, requestId: rid }, tx);
      return c;
    });
    const access = await tcol(p.tenantId, 'reviewAccess').where('councilId', '==', id).get();
    const batch = db().batch();
    access.docs.forEach((d) => batch.update(d.ref, { active: false, updatedAt: nowIso() }));
    if (!access.empty) await batch.commit();
    const office = (await tcol(p.tenantId, 'roleBindings').where('role', 'in', ['SCIENCE_OFFICER', 'SCIENCE_HEAD']).get()).docs.map((d) => d.get('uid') as string);
    await notify(p.tenantId, office, { title: `Biên bản hội đồng ${c.code} đã được xác nhận`, body: 'Phòng KH cập nhật kết quả vào hồ sơ theo quy trình.', link: `/councils/${id}` }).catch(() => undefined);
    return { status: 'MINUTES_CONFIRMED' };
  }
}
