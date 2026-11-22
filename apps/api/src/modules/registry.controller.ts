import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  hasRoleFor,
  REGISTRY,
  REGISTRY_KINDS,
  registryPersonUids,
  SCIENCE_OFFICE,
  validateRegistry,
  type DocumentMeta,
  type Principal,
  type RegistryDef,
  type RegistryItem,
  type RegistryKind,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, unitPathOf } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { audit, canRead, holdersOf, listVisible, notify, reserveCode } from '../common/records';
import { docData, parse } from '../common/util';
import { db, nowIso, tcol } from '../infra';

const PREFIX: Record<RegistryKind, string> = {
  research_group: 'NNC',
  ip_asset: 'SHTT',
  tech_transfer: 'CGCN',
  conference: 'HT',
  award: 'GT',
};

export const REGISTRY_COLLECTION = 'registryItems';

export function defOf(kind: string): RegistryDef {
  if (!(REGISTRY_KINDS as readonly string[]).includes(kind)) throw notFound('Loại danh mục không tồn tại.');
  return REGISTRY[kind as RegistryKind];
}

const isOffice = (p: Principal) => hasRoleFor(p, SCIENCE_OFFICE, null);
const EDITABLE = ['DRAFT', 'NEEDS_REVISION'];

const dataBody = z.object({ data: z.record(z.string(), z.unknown()) });

function clean(def: RegistryDef, raw: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === '' || v === undefined) continue;
    data[k] = typeof v === 'string' ? v.trim() : v;
  }
  const errors = validateRegistry(def, data);
  if (errors.length) throw unprocessable('VALIDATION_FAILED', 'Thông tin chưa hợp lệ.', errors.map((message) => ({ message })));
  const title = String(data[def.titleField] ?? '').slice(0, 500);
  return { data, title, personUids: registryPersonUids(def, data) };
}

export async function loadRegistry(p: Principal, id: string) {
  const snap = await tcol(p.tenantId, REGISTRY_COLLECTION).doc(id).get();
  if (!snap.exists) throw notFound();
  const rec = docData<RegistryItem>(snap);
  const visible =
    canRead(p, { ownerUid: rec.ownerUid, unitPath: rec.unitPath, memberUids: rec.personUids }) || (rec.status === 'CONFIRMED');
  if (!visible) throw notFound();
  return rec;
}

@Controller('registry')
export class RegistryController {
  @Get('defs')
  defs() {
    return { items: REGISTRY_KINDS.map((k) => REGISTRY[k]) };
  }

  @Get(':kind')
  async list(@CurrentPrincipal() p: Principal, @Param('kind') kind: string, @Query('status') status?: string, @Query('mine') mine?: string) {
    const def = defOf(kind);
    const visible = await listVisible<RegistryItem>(p, REGISTRY_COLLECTION, { memberField: 'personUids', limit: 1000 });
    // Bản ghi đã xác nhận là thông tin công khai trong trường (như hồ sơ khoa học).
    const confirmed = (await tcol(p.tenantId, REGISTRY_COLLECTION).where('kind', '==', kind).where('status', '==', 'CONFIRMED').limit(1000).get()).docs.map((d) => docData<RegistryItem>(d));
    const map = new Map<string, RegistryItem>();
    for (const x of [...visible, ...confirmed]) if (x.kind === kind) map.set(x.id, x);
    let items = [...map.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    if (status) items = items.filter((x) => status.split(',').includes(x.status));
    if (mine === '1') items = items.filter((x) => x.ownerUid === p.uid || x.personUids.includes(p.uid));
    return { def, items, canReview: isOffice(p) };
  }

  @Get(':kind/:id')
  async get(@CurrentPrincipal() p: Principal, @Param('kind') kind: string, @Param('id') id: string) {
    const def = defOf(kind);
    const rec = await loadRegistry(p, id);
    if (rec.kind !== kind) throw notFound();
    const docs = await tcol(p.tenantId, 'documents').where('parentId', '==', id).where('status', '==', 'ACTIVE').get();
    return {
      def,
      item: rec,
      documents: docs.docs.map((d) => docData<DocumentMeta>(d)).filter((d) => d.parentType === 'registry'),
      permissions: {
        canEdit: rec.ownerUid === p.uid && EDITABLE.includes(rec.status),
        canSubmit: rec.ownerUid === p.uid && EDITABLE.includes(rec.status),
        canReview: isOffice(p) && rec.status === 'SUBMITTED' && rec.ownerUid !== p.uid,
        canReopen: isOffice(p) && rec.status === 'CONFIRMED',
      },
    };
  }

  @Post(':kind')
  async create(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('kind') kind: string, @Body() body: unknown) {
    const def = defOf(kind);
    const b = parse(dataBody, body);
    if (!p.unitId) throw badRequest('Tài khoản chưa gắn đơn vị công tác.');
    const c = clean(def, b.data);
    const { path, unit } = await unitPathOf(p.tenantId, p.unitId);
    const ref = tcol(p.tenantId, REGISTRY_COLLECTION).doc();
    const code = await db().runTransaction(async (tx) => {
      const r = await reserveCode(tx, p.tenantId, PREFIX[def.kind]);
      r.commit();
      const now = nowIso();
      const rec: Omit<RegistryItem, 'id'> = {
        tenantId: p.tenantId,
        kind: def.kind,
        code: r.code,
        title: c.title,
        data: c.data,
        personUids: c.personUids,
        ownerUid: p.uid,
        ownerName: p.displayName,
        unitId: unit.id,
        unitPath: path,
        unitName: unit.name,
        status: 'DRAFT',
        reviewNote: null,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      tx.set(ref, rec);
      audit({ actor: p, action: `registry.${kind}.create`, resourceType: 'registry', resourceId: ref.id, resourceVersion: 1, requestId: rid }, tx);
      return r.code;
    });
    return { id: ref.id, code };
  }

  @Patch(':kind/:id')
  async update(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('kind') kind: string, @Param('id') id: string, @Body() body: unknown) {
    const def = defOf(kind);
    const b = parse(dataBody.extend({ expectedVersion: z.number().int() }), body);
    const c = clean(def, b.data);
    const ref = tcol(p.tenantId, REGISTRY_COLLECTION).doc(id);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const rec = docData<RegistryItem>(snap);
      if (rec.ownerUid !== p.uid || !EDITABLE.includes(rec.status)) throw forbidden('Chỉ người kê khai được sửa khi ở trạng thái Nháp hoặc Cần bổ sung.');
      if (rec.version !== b.expectedVersion) throw conflict('VERSION_CONFLICT', 'Bản ghi đã thay đổi ở nơi khác. Vui lòng tải lại.');
      const version = rec.version + 1;
      tx.update(ref, { data: c.data, title: c.title, personUids: c.personUids, version, updatedAt: nowIso() });
      audit({ actor: p, action: `registry.${kind}.update`, resourceType: 'registry', resourceId: id, resourceVersion: version, requestId: rid }, tx);
      return { id, version };
    });
  }

  @Delete(':kind/:id')
  async remove(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('kind') kind: string, @Param('id') id: string) {
    defOf(kind);
    const ref = tcol(p.tenantId, REGISTRY_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw notFound();
    const rec = docData<RegistryItem>(snap);
    if (rec.ownerUid !== p.uid || rec.status !== 'DRAFT') throw forbidden('Chỉ xóa được bản nháp của chính mình.');
    await ref.delete();
    await audit({ actor: p, action: `registry.${kind}.delete`, resourceType: 'registry', resourceId: id, requestId: rid });
    return { id, deleted: true };
  }

  /** submit (người kê khai) · confirm / return (Phòng KH, không phải người kê khai) · reopen (Phòng KH). */
  @Post(':kind/:id/:action')
  async act(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('kind') kind: string, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    const def = defOf(kind);
    const b = parse(z.object({ expectedVersion: z.number().int(), note: z.string().max(2000).optional() }), body);
    const ref = tcol(p.tenantId, REGISTRY_COLLECTION).doc(id);
    const out = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const rec = docData<RegistryItem>(snap);
      if (rec.version !== b.expectedVersion) throw conflict('VERSION_CONFLICT', 'Bản ghi đã thay đổi ở nơi khác. Vui lòng tải lại.');
      let patch: Partial<RegistryItem>;
      if (action === 'submit') {
        if (rec.ownerUid !== p.uid || !EDITABLE.includes(rec.status)) throw forbidden();
        const errors = validateRegistry(def, rec.data);
        if (errors.length) throw unprocessable('VALIDATION_FAILED', 'Thông tin chưa đầy đủ.', errors.map((message) => ({ message })));
        patch = { status: 'SUBMITTED' };
      } else if (action === 'confirm' || action === 'return') {
        if (!isOffice(p)) throw forbidden('Chỉ Phòng quản lý khoa học được xác nhận.');
        if (rec.ownerUid === p.uid) throw forbidden('Không tự xác nhận bản ghi của chính mình.', 'SELF_REVIEW');
        if (rec.status !== 'SUBMITTED') throw conflict('INVALID_STATE', 'Bản ghi không ở trạng thái chờ xác nhận.');
        if (action === 'return' && !b.note?.trim()) throw badRequest('Cần ghi rõ nội dung cần bổ sung.');
        patch =
          action === 'confirm'
            ? { status: 'CONFIRMED', reviewNote: b.note ?? null, confirmedBy: p.uid, confirmedByName: p.displayName, confirmedAt: nowIso() }
            : { status: 'NEEDS_REVISION', reviewNote: b.note ?? null };
      } else if (action === 'reopen') {
        if (!isOffice(p)) throw forbidden();
        if (rec.status !== 'CONFIRMED') throw conflict('INVALID_STATE', 'Chỉ mở lại bản ghi đã xác nhận.');
        if (!b.note?.trim()) throw badRequest('Cần ghi lý do mở lại.');
        patch = { status: 'NEEDS_REVISION', reviewNote: b.note, confirmedBy: null, confirmedByName: null, confirmedAt: null };
      } else throw notFound();
      const version = rec.version + 1;
      tx.update(ref, { ...patch, version, updatedAt: nowIso() });
      audit({ actor: p, action: `registry.${kind}.${action}`, resourceType: 'registry', resourceId: id, resourceVersion: version, requestId: rid, detail: b.note ?? null }, tx);
      return { rec, status: patch.status, version };
    });
    const link = `/registry/${kind}/${id}`;
    if (action === 'submit') {
      const office = await holdersOf(p.tenantId, SCIENCE_OFFICE, null);
      await notify(p.tenantId, office.filter((u) => u !== p.uid), { title: `${def.label} chờ xác nhận`, body: `${out.rec.code} — ${out.rec.title}`, link }).catch(() => undefined);
    } else {
      await notify(p.tenantId, [out.rec.ownerUid], { title: `${def.label} ${out.status === 'CONFIRMED' ? 'đã được xác nhận' : 'cần bổ sung'}`, body: `${out.rec.code} — ${b.note ?? out.rec.title}`, link }).catch(() => undefined);
    }
    return { id, status: out.status, version: out.version };
  }
}

/** Bản ghi đã xác nhận có người này tham gia — dùng cho hồ sơ khoa học. */
export async function confirmedRegistryFor(tenantId: string, uid: string) {
  const snap = await tcol(tenantId, REGISTRY_COLLECTION).where('personUids', 'array-contains', uid).get();
  return snap.docs.map((d) => docData<RegistryItem>(d)).filter((x) => x.status === 'CONFIRMED');
}
