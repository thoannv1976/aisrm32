import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  hasRoleFor,
  normalizeDoi,
  normalizeTitle,
  PUBLICATION_WORKFLOW,
  SCIENCE_OFFICE,
  type Principal,
  type Publication,
} from '@aisrm/shared';
import { z } from 'zod';
import { explainVerification, extractPublication } from '../ai/features-ext';
import { CurrentPrincipal, RequestId, unitPathOf } from '../common/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../common/errors';
import { audit, canRead, reserveCode } from '../common/records';
import { docData, parse } from '../common/util';
import { db, nowIso, tcol } from '../infra';
import { similarity } from '../integrations/crossref';
import { fetchOrcidWorks, normalizeOrcid, orcidTypeToPublication } from '../integrations/orcid';

async function loadPub(p: Principal, id: string) {
  const s = await tcol(p.tenantId, 'publications').doc(id).get();
  if (!s.exists) throw notFound();
  const rec = docData<Publication & { verification?: unknown; orcidCheck?: unknown }>(s);
  if (!canRead(p, rec)) throw notFound();
  return rec;
}

/** Trích văn bản từ PDF (không gửi tệp ra ngoài; chạy trong máy chủ). */
export async function pdfText(buf: Buffer): Promise<string> {
  type Unpdf = {
    getDocumentProxy: (d: Uint8Array) => Promise<unknown>;
    extractText: (pdf: unknown, o: { mergePages: boolean }) => Promise<{ text: string | string[] }>;
  };
  // unpdf chỉ có bản ESM; bản build CommonJS nạp qua require(esm) (Node ≥ 22.12).
  // @ts-ignore -- moduleResolution "Node" không đọc được khai báo kiểu của gói ESM
  const { extractText, getDocumentProxy } = (await import('unpdf')) as Unpdf;
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.slice(0, 3).join('\n');
}

@Controller()
export class PublicationsExtController {
  /** Kiểm chứng với ORCID: công bố (theo DOI hoặc tên bài) có trong hồ sơ ORCID công khai của tác giả trong trường không. */
  @Post('publications/:id/verify-orcid')
  async verifyOrcid(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const rec = await loadPub(p, id);
    if (rec.ownerUid !== p.uid && !hasRoleFor(p, SCIENCE_OFFICE, rec.unitPath)) throw forbidden();
    const internal = rec.authors.filter((a) => a.uid);
    const profiles = await Promise.all(internal.map((a) => tcol(p.tenantId, 'researcherProfiles').doc(a.uid!).get()));
    const doi = normalizeDoi(rec.doi);
    const authors = [];
    for (let i = 0; i < internal.length; i++) {
      const orcid = normalizeOrcid(profiles[i].get('orcid') as string | undefined);
      if (!orcid) {
        authors.push({ name: internal[i].name, orcid: '', found: false, status: 'NO_ORCID', message: 'Tác giả chưa khai báo ORCID hợp lệ trong hồ sơ khoa học.' });
        continue;
      }
      const res = await fetchOrcidWorks(orcid);
      if (!res.ok) {
        authors.push({ name: internal[i].name, orcid, found: false, status: 'ERROR', message: res.message });
        continue;
      }
      const byDoi = doi ? res.works.find((w) => w.doi === doi) : undefined;
      const byTitle = byDoi ?? res.works.find((w) => similarity(w.title, rec.title) >= 0.85);
      authors.push({
        name: internal[i].name,
        orcid,
        found: !!byTitle,
        status: byDoi ? 'MATCH_DOI' : byTitle ? 'MATCH_TITLE' : 'NOT_IN_ORCID',
        message: byDoi ? `Có trong ORCID (khớp DOI, ${res.works.length} công trình).` : byTitle ? `Có trong ORCID (khớp tên bài "${byTitle.title}").` : `Không thấy trong ${res.works.length} công trình công khai trên ORCID — có thể tác giả chưa cập nhật ORCID.`,
      });
    }
    const result = { source: 'orcid', checkedAt: nowIso(), checkedByName: p.displayName, authors, note: internal.length ? null : 'Công bố không có tác giả trong trường để đối chiếu ORCID.' };
    await tcol(p.tenantId, 'publications').doc(id).update({ orcidCheck: result });
    await audit({ actor: p, action: 'publication.verify_orcid', resourceType: 'publication', resourceId: id, resourceVersion: rec.version, requestId: rid, detail: authors.map((a) => a.status).join(',') });
    return result;
  }

  /** AI giải thích kết quả kiểm chứng (Crossref + ORCID) cho chuyên viên. */
  @Post('publications/:id/explain-verification')
  async explain(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const rec = await loadPub(p, id);
    if (rec.ownerUid !== p.uid && !hasRoleFor(p, SCIENCE_OFFICE, rec.unitPath)) throw forbidden();
    const v = rec.verification as Parameters<typeof explainVerification>[1]['crossref'];
    const o = rec.orcidCheck as Parameters<typeof explainVerification>[1]['orcid'];
    if (!v && !o) throw unprocessable('NO_VERIFICATION', 'Chưa có kết quả kiểm chứng. Hãy kiểm chứng DOI (Crossref) hoặc ORCID trước.');
    const draft = await explainVerification(p, { title: rec.title, crossref: v ?? null, orcid: o ?? null });
    await audit({ actor: p, action: 'ai.verify_explain', resourceType: 'publication', resourceId: id, requestId: rid, detail: `${draft.model.provider}/${draft.model.modelId}${draft.mock ? ' (mock)' : ''}` });
    return draft;
  }

  /** Trích thông tin công bố từ PDF (quy tắc + AI). Không lưu tệp; trả dữ liệu để người dùng kiểm tra rồi khai báo. */
  @Post('publications/extract-pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async extract(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw badRequest('Chưa chọn tệp PDF.');
    if (file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString() !== '%PDF-') throw unprocessable('FILE_TYPE_NOT_ALLOWED', 'Chỉ nhận tệp PDF.');
    let text: string;
    try {
      text = await pdfText(file.buffer);
    } catch {
      throw unprocessable('PDF_UNREADABLE', 'Không đọc được nội dung PDF (tệp lỗi hoặc có mật khẩu).');
    }
    if (text.replace(/\s/g, '').length < 50) throw unprocessable('PDF_NO_TEXT', 'PDF không có lớp chữ (bản scan). Cần OCR trước khi trích.');
    const draft = await extractPublication(p, text);
    await audit({ actor: p, action: 'ai.publication_extract', resourceType: 'publication', resourceId: 'new', requestId: rid, detail: `${draft.model.provider}/${draft.model.modelId}${draft.mock ? ' (mock)' : ''}` });
    return { ...draft, textPreview: text.slice(0, 1500) };
  }

  /** Xem công trình trên ORCID của chính mình, đánh dấu cái đã có trong AI-SRM. */
  @Get('me/orcid/works')
  async myOrcid(@CurrentPrincipal() p: Principal) {
    const prof = await tcol(p.tenantId, 'researcherProfiles').doc(p.uid).get();
    const orcid = prof.get('orcid') as string | undefined;
    if (!orcid) throw unprocessable('NO_ORCID', 'Hãy khai báo ORCID trong hồ sơ khoa học trước.');
    const res = await fetchOrcidWorks(orcid);
    const mine = await tcol(p.tenantId, 'publications').where('authorUids', 'array-contains', p.uid).get();
    const dois = new Set(mine.docs.map((d) => d.get('doiNormalized') as string | null).filter(Boolean));
    const titles = mine.docs.map((d) => d.get('title') as string);
    return { ...res, works: res.works.map((w) => ({ ...w, alreadyInSystem: (w.doi && dois.has(w.doi)) || titles.some((t) => similarity(t, w.title) >= 0.85) })) };
  }

  /** Nhập công trình ORCID thành công bố NHÁP (người dùng kiểm tra, bổ sung rồi mới nộp). */
  @Post('me/orcid/import')
  async importOrcid(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = parse(z.object({ putCodes: z.array(z.string().max(30)).min(1).max(50) }), body);
    if (!p.unitId) throw badRequest('Tài khoản chưa gắn đơn vị công tác.');
    const prof = await tcol(p.tenantId, 'researcherProfiles').doc(p.uid).get();
    const res = await fetchOrcidWorks((prof.get('orcid') as string) ?? '');
    if (!res.ok) throw unprocessable('ORCID_ERROR', res.message);
    const mine = await tcol(p.tenantId, 'publications').where('authorUids', 'array-contains', p.uid).get();
    const dois = new Set(mine.docs.map((d) => d.get('doiNormalized') as string | null).filter(Boolean));
    const { path, unit } = await unitPathOf(p.tenantId, p.unitId);
    const created: { id: string; code: string; title: string }[] = [];
    const skipped: string[] = [];
    for (const w of res.works.filter((x) => b.putCodes.includes(x.putCode))) {
      if (w.doi && dois.has(w.doi)) {
        skipped.push(w.title);
        continue;
      }
      const ref = tcol(p.tenantId, 'publications').doc();
      const code = await db().runTransaction(async (tx) => {
        const r = await reserveCode(tx, p.tenantId, 'CB');
        r.commit();
        const now = nowIso();
        tx.set(ref, {
          tenantId: p.tenantId,
          code: r.code,
          title: w.title,
          titleNormalized: normalizeTitle(w.title),
          type: orcidTypeToPublication(w.type),
          venue: w.venue ?? '',
          year: w.year ?? new Date().getFullYear(),
          doi: w.doi,
          doiNormalized: w.doi,
          url: w.url,
          indexing: [],
          authors: [{ name: p.displayName, uid: p.uid, isInternal: true, order: 1 }],
          authorUids: [p.uid],
          ownerUid: p.uid,
          ownerName: p.displayName,
          unitId: unit.id,
          unitPath: path,
          unitName: unit.name,
          projectId: null,
          status: PUBLICATION_WORKFLOW.initial,
          workflowKey: 'publication',
          workflowVersion: PUBLICATION_WORKFLOW.version,
          actorsByAction: {},
          returnTo: null,
          importedFrom: { source: 'orcid', orcid: res.orcid, putCode: w.putCode, at: now },
          createdAt: now,
          createdBy: p.uid,
          updatedAt: now,
          updatedBy: p.uid,
          version: 1,
        });
        audit({ actor: p, action: 'publication.import_orcid', resourceType: 'publication', resourceId: ref.id, resourceVersion: 1, requestId: rid, detail: w.putCode }, tx);
        return r.code;
      });
      if (w.doi) dois.add(w.doi);
      created.push({ id: ref.id, code, title: w.title });
    }
    return { created, skipped, note: 'Công bố nhập từ ORCID ở trạng thái Nháp; cần bổ sung đủ tác giả, nơi công bố rồi mới nộp xác minh.' };
  }
}
