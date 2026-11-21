import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  hasRoleFor,
  normalizeDoi,
  normalizeTitle,
  PUBLICATION_TYPE_LABELS,
  PUBLICATION_WORKFLOW,
  SCIENCE_OFFICE,
  stateLabel,
  type DocumentMeta,
  type Principal,
  type Publication,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, unitPathOf } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit, canRead, listVisible, reserveCode } from '../common/records';
import { parseIdempotencyKey, runTransition, transitionBody } from '../common/transition';
import { docData, parse, toCsv, withActions } from '../common/util';

const authorSchema = z.object({
  name: z.string().min(1).max(200),
  uid: z.string().max(128).nullable(),
  isInternal: z.boolean(),
  order: z.number().int().positive(),
});

const pubBody = z.object({
  title: z.string().min(3).max(1000),
  type: z.enum(['JOURNAL', 'CONFERENCE', 'BOOK', 'BOOK_CHAPTER', 'OTHER']),
  venue: z.string().max(500).default(''),
  year: z.number().int().min(1950).max(2100),
  doi: z.string().max(300).nullable().optional(),
  url: z.string().url().max(1000).nullable().optional(),
  indexing: z.array(z.string().max(50)).max(10).default([]),
  authors: z.array(authorSchema).min(1).max(100),
  projectId: z.string().max(128).nullable().optional(),
});

const EDITABLE = ['DRAFT', 'NEEDS_REVISION'];
const canEdit = (p: Principal, r: Publication) => r.ownerUid === p.uid && EDITABLE.includes(r.status);

function prepare(b: z.infer<typeof pubBody>) {
  const doiNormalized = b.doi ? normalizeDoi(b.doi) : null;
  if (b.doi && !doiNormalized) throw badRequest('DOI không đúng định dạng (vd: 10.1234/abcd).');
  const authors = [...b.authors].sort((a, c) => a.order - c.order);
  return {
    title: b.title.trim(),
    titleNormalized: normalizeTitle(b.title),
    type: b.type,
    venue: b.venue,
    year: b.year,
    doi: b.doi?.trim() || null,
    doiNormalized,
    url: b.url ?? null,
    indexing: b.indexing,
    authors,
    projectId: b.projectId ?? null,
  };
}

/** Gợi ý bản ghi nghi trùng (theo DOI chuẩn hóa hoặc tiêu đề chuẩn hóa). Không tự xóa/gộp. */
async function findDuplicates(tenantId: string, doiNormalized: string | null, titleNormalized: string, excludeId?: string) {
  const col = tcol(tenantId, 'publications');
  const qs = [col.where('titleNormalized', '==', titleNormalized).limit(10).get()];
  if (doiNormalized) qs.push(col.where('doiNormalized', '==', doiNormalized).limit(10).get());
  const snaps = await Promise.all(qs);
  const map = new Map<string, { id: string; code: string; title: string; status: string; ownerName: string; reason: string }>();
  snaps.forEach((s, i) =>
    s.docs.forEach((d) => {
      if (d.id === excludeId || d.get('status') === 'REJECTED') return;
      const prev = map.get(d.id);
      const reason = i === 0 ? 'Trùng tiêu đề' : 'Trùng DOI';
      map.set(d.id, {
        id: d.id,
        code: d.get('code'),
        title: d.get('title'),
        status: d.get('status'),
        ownerName: d.get('ownerName'),
        reason: prev ? `${prev.reason}, ${reason}` : reason,
      });
    }),
  );
  return [...map.values()];
}

async function loadReadable(p: Principal, id: string) {
  const snap = await tcol(p.tenantId, 'publications').doc(id).get();
  if (!snap.exists) throw notFound();
  const rec = docData<Publication>(snap);
  if (!canRead(p, rec)) throw notFound();
  return rec;
}

@Controller('publications')
export class PublicationsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal, @Query('status') status?: string, @Query('mine') mine?: string) {
    let items = await listVisible<Publication>(p, 'publications', { memberField: 'authorUids' });
    if (status) items = items.filter((x) => status.split(',').includes(x.status));
    if (mine === '1') items = items.filter((x) => x.ownerUid === p.uid || x.authorUids?.includes(p.uid));
    return {
      items: items.map((x) => ({
        id: x.id,
        code: x.code,
        title: x.title,
        type: x.type,
        venue: x.venue,
        year: x.year,
        doi: x.doi,
        status: x.status,
        ownerName: x.ownerName,
        unitName: x.unitName,
        authors: x.authors.map((a) => a.name).join('; '),
        updatedAt: x.updatedAt,
      })),
      nextCursor: null,
    };
  }

  @Get('check-duplicates')
  async checkDuplicates(@CurrentPrincipal() p: Principal, @Query('doi') doi?: string, @Query('title') title?: string) {
    return { items: await findDuplicates(p.tenantId, normalizeDoi(doi), normalizeTitle(title ?? ''), undefined) };
  }

  /** Xuất công bố đã xác nhận — chỉ phòng KH. Công bố chưa xác nhận không xuất như đã duyệt. */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cong-bo-da-xac-nhan.csv"')
  async export(@CurrentPrincipal() p: Principal, @RequestId() rid: string) {
    if (!hasRoleFor(p, SCIENCE_OFFICE, null)) throw forbidden();
    const snap = await tcol(p.tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).get();
    const rows = snap.docs.map((d) => docData<Publication>(d)).map((x) => [
      x.code,
      x.title,
      PUBLICATION_TYPE_LABELS[x.type],
      x.venue,
      x.year,
      x.doi,
      x.indexing.join('; '),
      x.authors.map((a) => a.name).join('; '),
      x.unitName,
      stateLabel('publication', x.status),
    ]);
    await audit({ actor: p, action: 'publication.export', resourceType: 'publication', resourceId: '*', requestId: rid, detail: `${rows.length} bản ghi` });
    return toCsv(['Mã', 'Tiêu đề', 'Loại', 'Nơi công bố', 'Năm', 'DOI', 'Chỉ mục', 'Tác giả', 'Đơn vị', 'Trạng thái'], rows);
  }

  @Post()
  async create(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = prepare(parse(pubBody, body));
    if (!p.unitId) throw badRequest('Tài khoản chưa gắn đơn vị công tác.');
    const { path, unit } = await unitPathOf(p.tenantId, p.unitId);
    const ref = tcol(p.tenantId, 'publications').doc();
    const authorUids = [...new Set(b.authors.map((a) => a.uid).filter((u): u is string => !!u))];
    const code = await firestore().runTransaction(async (tx) => {
      const r = await reserveCode(tx, p.tenantId, 'CB');
      r.commit();
      const now = nowIso();
      tx.set(ref, {
        tenantId: p.tenantId,
        code: r.code,
        ...b,
        authorUids,
        ownerUid: p.uid,
        ownerName: p.displayName,
        unitId: unit.id,
        unitPath: path,
        unitName: unit.name,
        status: PUBLICATION_WORKFLOW.initial,
        workflowKey: 'publication',
        workflowVersion: PUBLICATION_WORKFLOW.version,
        actorsByAction: {},
        returnTo: null,
        createdAt: now,
        createdBy: p.uid,
        updatedAt: now,
        updatedBy: p.uid,
        version: 1,
      });
      audit({ actor: p, action: 'publication.create', resourceType: 'publication', resourceId: ref.id, resourceVersion: 1, requestId: rid }, tx);
      return r.code;
    });
    return { id: ref.id, code, duplicates: await findDuplicates(p.tenantId, b.doiNormalized, b.titleNormalized, ref.id) };
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const rec = await loadReadable(p, id);
    const [docs, duplicates] = await Promise.all([
      tcol(p.tenantId, 'documents').where('parentId', '==', id).where('status', '==', 'ACTIVE').get(),
      findDuplicates(p.tenantId, rec.doiNormalized, rec.titleNormalized, id),
    ]);
    return {
      ...withActions(PUBLICATION_WORKFLOW, rec, p, { canEdit: canEdit(p, rec) }),
      documents: docs.docs.map((d) => docData<DocumentMeta>(d)).filter((d) => d.parentType === 'publication'),
      duplicates,
    };
  }

  @Patch(':id')
  async update(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const raw = parse(pubBody.extend({ expectedVersion: z.number().int() }), body);
    const b = prepare(raw);
    const ref = tcol(p.tenantId, 'publications').doc(id);
    return firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound();
      const rec = docData<Publication>(snap);
      if (!canRead(p, rec)) throw notFound();
      if (!canEdit(p, rec)) throw forbidden('Chỉ người nộp được sửa khi ở trạng thái Nháp hoặc Cần bổ sung.');
      if (rec.version !== raw.expectedVersion) throw conflict('VERSION_CONFLICT', 'Bản ghi đã thay đổi. Vui lòng tải lại.');
      const version = rec.version + 1;
      tx.update(ref, {
        ...b,
        authorUids: [...new Set(b.authors.map((a) => a.uid).filter((u): u is string => !!u))],
        version,
        updatedAt: nowIso(),
        updatedBy: p.uid,
      });
      audit({ actor: p, action: 'publication.update', resourceType: 'publication', resourceId: id, resourceVersion: version, requestId: rid }, tx);
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
    return runTransition<Publication>({
      principal: p,
      requestId: rid,
      collection: 'publications',
      resourceType: 'publication',
      id,
      workflow: PUBLICATION_WORKFLOW,
      body: b,
      idempotencyKey: parseIdempotencyKey(idemKey),
      link: (x) => `/publications/${x}`,
      titleOf: (r) => `${r.code} — ${r.title}`,
      hook: async (tx, rec, _to, action) => {
        if (action === 'submit') {
          const docs = await tx.get(tcol(p.tenantId, 'documents').where('parentId', '==', rec.id).where('status', '==', 'ACTIVE'));
          if (docs.empty && !rec.doi && !rec.url) {
            throw unprocessable('EVIDENCE_REQUIRED', 'Cần có DOI, đường dẫn hoặc tệp minh chứng trước khi nộp xác nhận.');
          }
        }
      },
    });
  }

  @Get(':id/history')
  async history(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    await loadReadable(p, id);
    const snap = await tcol(p.tenantId, 'publications').doc(id).collection('history').orderBy('at', 'asc').get();
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
}
