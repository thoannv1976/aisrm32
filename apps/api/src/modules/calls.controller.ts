import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { hasRoleFor, SCIENCE_OFFICE, type Call, type Principal } from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit, reserveCode } from '../common/records';
import { docData, parse } from '../common/util';

const fieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/),
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select']),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
  help: z.string().max(500).optional(),
  maxLength: z.number().int().positive().optional(),
});

const createCall = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(5000).default(''),
  year: z.number().int().min(2000).max(2100),
  level: z.enum(['UNIVERSITY', 'UNIT', 'STUDENT']),
  openAt: z.string().datetime({ offset: true }),
  closeAt: z.string().datetime({ offset: true }),
  eligibility: z.string().max(5000).default(''),
  expertReview: z.boolean().default(false),
  fields: z.array(fieldSchema).max(40),
  checklist: z
    .array(z.object({ key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: z.string().min(1).max(200), required: z.boolean() }))
    .max(20),
});

const isOffice = (p: Principal) => hasRoleFor(p, SCIENCE_OFFICE, null);

export function callIsOpen(c: Pick<Call, 'status' | 'openAt' | 'closeAt'>, now = new Date()): boolean {
  return c.status === 'OPEN' && new Date(c.openAt) <= now && now <= new Date(c.closeAt);
}

@Controller('calls')
export class CallsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal) {
    const snap = await tcol(p.tenantId, 'calls').orderBy('openAt', 'desc').limit(200).get();
    const items = snap.docs
      .map((d) => docData<Call>(d))
      .filter((c) => isOffice(p) || c.status !== 'DRAFT')
      .map((c) => ({ ...c, isOpenNow: callIsOpen(c) }));
    return { items, canManage: isOffice(p) };
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const snap = await tcol(p.tenantId, 'calls').doc(id).get();
    if (!snap.exists) throw notFound();
    const c = docData<Call>(snap);
    if (c.status === 'DRAFT' && !isOffice(p)) throw notFound();
    return { item: { ...c, isOpenNow: callIsOpen(c) }, canManage: isOffice(p) };
  }

  @Post()
  async create(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!isOffice(p)) throw forbidden('Chỉ phòng quản lý khoa học được mở đợt đăng ký.');
    const b = parse(createCall, body);
    if (new Date(b.closeAt) <= new Date(b.openAt)) throw badRequest('Hạn nộp phải sau ngày mở đợt.');
    const keys = new Set<string>();
    for (const f of [...b.fields, ...b.checklist]) {
      if (keys.has(f.key)) throw badRequest(`Mã trường bị trùng: ${f.key}`);
      keys.add(f.key);
    }
    const ref = tcol(p.tenantId, 'calls').doc();
    const code = await firestore().runTransaction(async (tx) => {
      const r = await reserveCode(tx, p.tenantId, 'DOT');
      r.commit();
      const now = nowIso();
      tx.set(ref, {
        tenantId: p.tenantId,
        code: r.code,
        title: b.title,
        description: b.description,
        year: b.year,
        level: b.level,
        openAt: b.openAt,
        closeAt: b.closeAt,
        eligibility: b.eligibility,
        expertReview: b.expertReview,
        form: { version: 1, fields: b.fields, checklist: b.checklist },
        status: 'DRAFT',
        createdAt: now,
        createdBy: p.uid,
        updatedAt: now,
        updatedBy: p.uid,
        version: 1,
      });
      audit({ actor: p, action: 'call.create', resourceType: 'call', resourceId: ref.id, resourceVersion: 1, requestId: rid }, tx);
      return r.code;
    });
    return { id: ref.id, code };
  }

  /** Mở / đóng đợt. Biểu mẫu đã mở không sửa trực tiếp — hồ sơ đang chạy giữ phiên bản biểu mẫu ban đầu. */
  @Post(':id/status')
  async setStatus(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    if (!isOffice(p)) throw forbidden();
    const b = parse(z.object({ status: z.enum(['OPEN', 'CLOSED']), expectedVersion: z.number().int() }), body);
    const ref = tcol(p.tenantId, 'calls').doc(id);
    return firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const c = snap.data() as Call;
      if (c.version !== b.expectedVersion) throw conflict('VERSION_CONFLICT', 'Đợt đã được cập nhật bởi người khác.');
      if (c.status === 'CLOSED') throw conflict('INVALID_STATE', 'Đợt đã đóng.');
      const version = c.version + 1;
      tx.update(ref, { status: b.status, version, updatedAt: nowIso(), updatedBy: p.uid });
      audit({ actor: p, action: `call.${b.status.toLowerCase()}`, resourceType: 'call', resourceId: id, resourceVersion: version, requestId: rid }, tx);
      return { id, status: b.status, version };
    });
  }
}
