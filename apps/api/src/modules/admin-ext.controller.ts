import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { hasAnyRole, isBindingActive, ROLE_LABELS, ROLES, type Principal, type Role } from '@aisrm/shared';
import { z } from 'zod';
import { applyImport } from '../accounts/import';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { audit, notify } from '../common/records';
import { parse } from '../common/util';
import { db, identity, nowIso, tcol } from '../infra';
import { loadMailSettings, sendMail, smtpInfo } from '../infra/mailer';

const isAdmin = (p: Principal) => hasAnyRole(p, ['SYS_ADMIN', 'SCIENCE_HEAD']);
const dateTime = z.string().datetime({ offset: true });

/** Vai trò được ủy quyền (không ủy quyền vai trò quản trị hệ thống / AI / tích hợp). */
const DELEGABLE: Role[] = ['UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR', 'SUPERVISOR', 'REVIEWER'];

/** Hồ sơ chuyển giao khi bàn giao: chỉ hồ sơ chưa kết thúc. */
const HANDOVER: Record<string, { collection: string; open: string[]; label: string }> = {
  proposals: { collection: 'proposals', open: ['DRAFT', 'NEEDS_REVISION', 'UNIT_REVIEW', 'SCIENCE_REVIEW', 'EXPERT_REVIEW', 'APPROVAL_PENDING'], label: 'Đề xuất' },
  projects: { collection: 'projects', open: ['CONTRACT_PENDING', 'ACTIVE', 'ACCEPTANCE_PENDING', 'COMPLETION_REVISION', 'SUSPENDED'], label: 'Đề tài' },
  publications: { collection: 'publications', open: ['DRAFT', 'NEEDS_REVISION', 'SUBMITTED', 'VERIFIED'], label: 'Công bố' },
};

@Controller('admin')
export class AdminExtController {
  // ---------------------------------------------------------------- Ủy quyền
  @Get('delegations')
  async delegations(@CurrentPrincipal() p: Principal) {
    const snap = { docs: (await tcol(p.tenantId, 'roleBindings').get()).docs.filter((d) => !!d.get('delegatedBy')) };
    const mine = !isAdmin(p);
    const people = new Map((await tcol(p.tenantId, 'people').get()).docs.map((d) => [d.id, d.get('displayName') as string]));
    const units = new Map((await tcol(p.tenantId, 'units').get()).docs.map((d) => [d.id, d.get('name') as string]));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as { uid: string; role: Role; scopeType: string; scopeId: string | null; validFrom: string | null; validUntil: string | null; delegatedBy: string; reason?: string; createdAt?: string; revokedAt?: string }) }))
      .filter((x) => !mine || x.delegatedBy === p.uid || x.uid === p.uid)
      .map((x) => ({
        ...x,
        toName: people.get(x.uid) ?? x.uid,
        fromName: people.get(x.delegatedBy) ?? x.delegatedBy,
        roleLabel: ROLE_LABELS[x.role],
        scopeName: x.scopeId ? (units.get(x.scopeId) ?? x.scopeId) : 'Toàn trường',
        active: isBindingActive({ ...x, scopeType: x.scopeType as 'tenant' | 'unit' }),
      }))
      .sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
    // Vai trò người dùng đang giữ có thể ủy quyền
    const own = p.bindings.filter((b) => DELEGABLE.includes(b.role) && isBindingActive(b) && !b.delegatedBy).map((b) => ({ role: b.role, roleLabel: ROLE_LABELS[b.role], scopeType: b.scopeType, scopeId: b.scopeId ?? null, scopeName: b.scopeId ? (units.get(b.scopeId) ?? b.scopeId) : 'Toàn trường' }));
    return { items, delegable: own, isAdmin: isAdmin(p) };
  }

  /**
   * Ủy quyền có thời hạn: người giữ vai trò ủy quyền cho người khác (vd. Trưởng khoa đi công tác ủy quyền Phó khoa).
   * Quản trị / Trưởng phòng KH được lập ủy quyền thay. Nhật ký ghi rõ người ủy quyền.
   */
  @Post('delegations')
  async delegate(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = parse(z.object({ fromUid: z.string().max(128).optional(), toUid: z.string().min(1).max(128), role: z.enum(ROLES), scopeId: z.string().max(128).nullable(), validFrom: dateTime, validUntil: dateTime, reason: z.string().min(3).max(500) }), body);
    const fromUid = b.fromUid ?? p.uid;
    if (fromUid !== p.uid && !isAdmin(p)) throw forbidden('Chỉ quản trị lập ủy quyền thay người khác.');
    if (!DELEGABLE.includes(b.role)) throw badRequest('Vai trò này không được ủy quyền.');
    if (fromUid === b.toUid) throw badRequest('Không ủy quyền cho chính mình.');
    if (new Date(b.validUntil) <= new Date(b.validFrom)) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu.');
    if (new Date(b.validUntil).getTime() - new Date(b.validFrom).getTime() > 366 * 86400_000) throw badRequest('Ủy quyền tối đa 12 tháng.');
    const holder = await tcol(p.tenantId, 'roleBindings').where('uid', '==', fromUid).where('role', '==', b.role).get();
    const ok = holder.docs.some((d) => !d.get('delegatedBy') && (d.get('scopeId') ?? null) === b.scopeId && isBindingActive(d.data() as never));
    if (!ok) throw forbidden('Người ủy quyền không giữ vai trò này trong phạm vi đã chọn.');
    const to = await tcol(p.tenantId, 'people').doc(b.toUid).get();
    if (!to.exists || to.get('status') !== 'ACTIVE') throw notFound('Không tìm thấy người nhận ủy quyền.');
    const ref = tcol(p.tenantId, 'roleBindings').doc();
    await ref.set({ uid: b.toUid, role: b.role, scopeType: b.scopeId ? 'unit' : 'tenant', scopeId: b.scopeId, validFrom: b.validFrom, validUntil: b.validUntil, delegatedBy: fromUid, reason: b.reason, createdAt: nowIso(), createdBy: p.uid });
    await audit({ actor: p, action: 'role.delegate', resourceType: 'roleBinding', resourceId: ref.id, requestId: rid, detail: `${fromUid} → ${b.toUid}: ${b.role}@${b.scopeId ?? 'tenant'} đến ${b.validUntil}` });
    await notify(p.tenantId, [b.toUid], { title: 'Bạn được ủy quyền', body: `Vai trò ${ROLE_LABELS[b.role]} từ ${b.validFrom.slice(0, 10)} đến ${b.validUntil.slice(0, 10)}. Lý do: ${b.reason}`, link: '/' }).catch(() => undefined);
    return { id: ref.id };
  }

  @Delete('delegations/:id')
  async revoke(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const ref = tcol(p.tenantId, 'roleBindings').doc(id);
    const s = await ref.get();
    if (!s.exists || !s.get('delegatedBy')) throw notFound();
    if (s.get('delegatedBy') !== p.uid && !isAdmin(p)) throw forbidden();
    await ref.update({ validUntil: nowIso(), revokedAt: nowIso(), revokedBy: p.uid });
    await audit({ actor: p, action: 'role.delegation_revoke', resourceType: 'roleBinding', resourceId: id, requestId: rid });
    return { id, revoked: true };
  }

  // ---------------------------------------------------------------- Bàn giao hồ sơ
  @Post('handover/preview')
  async handoverPreview(@CurrentPrincipal() p: Principal, @Body() body: unknown) {
    if (!isAdmin(p)) throw forbidden();
    const b = parse(z.object({ fromUid: z.string().min(1).max(128) }), body);
    const out: { kind: string; label: string; id: string; code: string; title: string; status: string }[] = [];
    for (const [kind, h] of Object.entries(HANDOVER)) {
      const snap = await tcol(p.tenantId, h.collection).where('ownerUid', '==', b.fromUid).get();
      for (const d of snap.docs) if (h.open.includes(d.get('status'))) out.push({ kind, label: h.label, id: d.id, code: d.get('code'), title: d.get('title'), status: d.get('status') });
    }
    return { items: out };
  }

  /** Bàn giao hồ sơ chưa kết thúc sang người khác (nghỉ việc, chuyển công tác). Người mới trở thành chủ hồ sơ; người cũ không còn quyền sửa. */
  @Post('handover')
  async handover(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!isAdmin(p)) throw forbidden('Chỉ quản trị / Trưởng phòng KH được bàn giao hồ sơ.');
    const b = parse(z.object({ fromUid: z.string().min(1).max(128), toUid: z.string().min(1).max(128), items: z.array(z.object({ kind: z.enum(['proposals', 'projects', 'publications']), id: z.string().max(128) })).min(1).max(200), reason: z.string().min(3).max(500) }), body);
    if (b.fromUid === b.toUid) throw badRequest('Người nhận phải khác người bàn giao.');
    const to = await tcol(p.tenantId, 'people').doc(b.toUid).get();
    if (!to.exists || to.get('status') !== 'ACTIVE') throw notFound('Không tìm thấy người nhận.');
    const toName = to.get('displayName') as string;
    let moved = 0;
    for (const it of b.items) {
      const h = HANDOVER[it.kind];
      const ref = tcol(p.tenantId, h.collection).doc(it.id);
      await db().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) throw notFound();
        const d = s.data() as { ownerUid: string; status: string; version: number; members?: { uid: string | null; name: string; role: string }[]; memberUids?: string[]; authorUids?: string[] };
        if (d.ownerUid !== b.fromUid) throw conflict('OWNER_CHANGED', 'Chủ hồ sơ đã thay đổi.');
        if (!h.open.includes(d.status)) throw conflict('INVALID_STATE', 'Hồ sơ đã kết thúc, không bàn giao.');
        const patch: Record<string, unknown> = { ownerUid: b.toUid, ownerName: toName, version: d.version + 1, updatedAt: nowIso(), updatedBy: p.uid, handover: { fromUid: b.fromUid, at: nowIso(), byName: p.displayName, reason: b.reason } };
        if (d.members) {
          const members = d.members.map((m) => (m.role === 'PI' ? { ...m, uid: b.toUid, name: toName } : m));
          patch.members = members;
          patch.memberUids = [...new Set([b.toUid, ...(d.memberUids ?? []).filter((u) => u !== b.fromUid)])];
        }
        if (d.authorUids) patch.authorUids = [...new Set([...d.authorUids, b.toUid])];
        tx.update(ref, patch);
        audit({ actor: p, action: `${it.kind}.handover`, resourceType: it.kind.slice(0, -1), resourceId: it.id, resourceVersion: d.version + 1, requestId: rid, detail: `${b.fromUid} → ${b.toUid}: ${b.reason}` }, tx);
      });
      moved++;
    }
    await notify(p.tenantId, [b.toUid, b.fromUid], { title: 'Bàn giao hồ sơ', body: `${moved} hồ sơ đã được bàn giao cho ${toName}. Lý do: ${b.reason}`, link: '/' }).catch(() => undefined);
    return { moved };
  }

  // ---------------------------------------------------------------- Phản biện ngoài trường
  @Get('external-reviewers')
  async externals(@CurrentPrincipal() p: Principal) {
    if (!isAdmin(p) && !hasAnyRole(p, ['SCIENCE_OFFICER'])) throw forbidden();
    const snap = await tcol(p.tenantId, 'people').where('external', '==', true).get();
    const bindings = await tcol(p.tenantId, 'roleBindings').where('role', '==', 'REVIEWER').get();
    const until = new Map(bindings.docs.map((d) => [d.get('uid') as string, (d.get('validUntil') as string | null) ?? null]));
    return { items: snap.docs.map((d) => ({ uid: d.id, displayName: d.get('displayName'), email: d.get('email'), organization: d.get('organization') ?? null, expertise: d.get('expertise') ?? [], status: d.get('status'), validUntil: until.get(d.id) ?? null, active: d.get('status') === 'ACTIVE' && (!until.get(d.id) || new Date(until.get(d.id)!) > new Date()) })) };
  }

  /**
   * Tạo tài khoản phản biện ngoài trường có thời hạn: chỉ vai trò Phản biện, chỉ thấy hồ sơ được phân công
   * (sau khi khai báo không xung đột lợi ích). Mật khẩu tạm trả về một lần.
   */
  @Post('external-reviewers')
  async createExternal(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!isAdmin(p) && !hasAnyRole(p, ['SCIENCE_OFFICER'])) throw forbidden('Chỉ Phòng KH / quản trị tạo tài khoản phản biện ngoài.');
    const b = parse(z.object({ email: z.string().email().max(200), displayName: z.string().min(2).max(120), organization: z.string().min(2).max(300), title: z.string().max(200).nullable().optional(), expertise: z.array(z.string().max(100)).max(20).default([]), validUntil: dateTime }), body);
    if (new Date(b.validUntil) <= new Date()) throw badRequest('Thời hạn phải sau thời điểm hiện tại.');
    if (new Date(b.validUntil).getTime() - Date.now() > 366 * 86400_000) throw badRequest('Thời hạn tối đa 12 tháng.');
    const email = b.email.toLowerCase();
    const existing = await identity().findUidByEmail(email);
    if (existing) {
      const ppl = await tcol(p.tenantId, 'people').doc(existing).get();
      if (ppl.exists && !ppl.get('external')) throw conflict('INTERNAL_ACCOUNT', 'Email này là tài khoản trong trường; mời trực tiếp vào hội đồng.');
    }
    const units = await tcol(p.tenantId, 'units').get();
    const root = units.docs.find((d) => !d.get('parentId'));
    if (!root) throw badRequest('Trường chưa có đơn vị gốc.');
    const [res] = await applyImport(p.tenantId, [{ line: 1, email, displayName: b.displayName, unitId: root.id, title: b.title ?? 'Phản biện ngoài trường', roles: [{ role: 'REVIEWER', scopeId: null }], action: existing ? 'UPDATE' : 'CREATE', errors: [] }]);
    const binds = await tcol(p.tenantId, 'roleBindings').where('uid', '==', res.uid).get();
    const batch = db().batch();
    for (const d of binds.docs) if (d.get('role') === 'REVIEWER') batch.update(d.ref, { validUntil: b.validUntil, external: true });
    batch.set(tcol(p.tenantId, 'people').doc(res.uid), { external: true, organization: b.organization, expertise: b.expertise, status: 'ACTIVE', externalUntil: b.validUntil }, { merge: true });
    batch.set(tcol(p.tenantId, 'researcherProfiles').doc(res.uid), { expertise: b.expertise, academicTitle: '', degree: '', orcid: '', googleScholar: '', researchInterests: '', bio: `Phản biện ngoài trường — ${b.organization}`, updatedAt: nowIso() }, { merge: true });
    await batch.commit();
    await audit({ actor: p, action: 'account.external_reviewer', resourceType: 'account', resourceId: res.uid, requestId: rid, detail: `${b.organization} đến ${b.validUntil}` });
    return { uid: res.uid, email, temporaryPassword: res.temporaryPassword, validUntil: b.validUntil, note: res.temporaryPassword ? 'Mật khẩu tạm chỉ hiện một lần — gửi cho phản biện qua kênh an toàn.' : 'Tài khoản đã tồn tại; đã gia hạn quyền phản biện.' };
  }

  @Post('external-reviewers/:uid/disable')
  async disableExternal(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('uid') uid: string) {
    if (!isAdmin(p) && !hasAnyRole(p, ['SCIENCE_OFFICER'])) throw forbidden();
    const ref = tcol(p.tenantId, 'people').doc(uid);
    const s = await ref.get();
    if (!s.exists || !s.get('external')) throw notFound();
    await ref.update({ status: 'INACTIVE', updatedAt: nowIso() });
    await audit({ actor: p, action: 'account.external_disable', resourceType: 'account', resourceId: uid, requestId: rid });
    return { uid, status: 'INACTIVE' };
  }

  // ---------------------------------------------------------------- Thư điện tử
  @Get('mail')
  async mail(@CurrentPrincipal() p: Principal) {
    if (!hasAnyRole(p, ['SYS_ADMIN'])) throw forbidden();
    const [settings, log] = await Promise.all([loadMailSettings(p.tenantId), tcol(p.tenantId, 'mailLog').orderBy('at', 'desc').limit(50).get()]);
    return { settings, smtp: smtpInfo(), log: log.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }

  @Put('mail')
  async setMail(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!hasAnyRole(p, ['SYS_ADMIN'])) throw forbidden();
    const b = parse(z.object({ enabled: z.boolean(), scope: z.enum(['all', 'deadlines']) }), body);
    await tcol(p.tenantId, 'settings').doc('mail').set({ ...b, updatedAt: nowIso(), updatedBy: p.uid });
    await audit({ actor: p, action: 'mail.settings', resourceType: 'settings', resourceId: 'mail', requestId: rid, detail: `${b.enabled} ${b.scope}` });
    return b;
  }

  @Post('mail/test')
  async testMail(@CurrentPrincipal() p: Principal, @RequestId() rid: string) {
    if (!hasAnyRole(p, ['SYS_ADMIN'])) throw forbidden();
    if (!p.email) throw badRequest('Tài khoản quản trị chưa có email.');
    const r = await sendMail(p.tenantId, { uid: p.uid, email: p.email }, '[AI-SRM] Thư thử nghiệm', 'Máy chủ thư của AI-SRM đã gửi được thư này.', 'test');
    await audit({ actor: p, action: 'mail.test', resourceType: 'settings', resourceId: 'mail', requestId: rid, detail: r.status });
    return r;
  }
}
