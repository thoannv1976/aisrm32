import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { DocumentMeta, Principal, Project, Proposal, Publication } from '@aisrm/shared';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../common/errors';
import { config, files, nowIso, tcol } from '../infra';
import { audit, canRead, hasReviewAccess } from '../common/records';
import { docData, parse } from '../common/util';

const ALLOWED: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

/** Kiểm tra chữ ký tệp (magic bytes) cho các loại phổ biến — không tin Content-Type do trình duyệt gửi. */
function sniffOk(buf: Buffer, mime: string): boolean {
  const head = buf.subarray(0, 8);
  if (mime === 'application/pdf') return head.subarray(0, 5).toString() === '%PDF-';
  if (mime.includes('openxmlformats')) return head[0] === 0x50 && head[1] === 0x4b; // ZIP
  if (mime === 'image/png') return head[0] === 0x89 && head.subarray(1, 4).toString() === 'PNG';
  if (mime === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return head[0] === 0xd0 && head[1] === 0xcf;
  return true;
}

const uploadBody = z.object({
  parentType: z.enum(['proposal', 'project', 'publication']),
  parentId: z.string().min(1).max(128),
  checklistKey: z.string().max(64).optional().nullable(),
  milestoneId: z.string().max(128).optional().nullable(),
});

type Parent = (Proposal | Project | Publication) & { id: string };

async function loadParent(p: Principal, type: string, id: string): Promise<Parent> {
  const col = type === 'proposal' ? 'proposals' : type === 'project' ? 'projects' : 'publications';
  const snap = await tcol(p.tenantId, col).doc(id).get();
  if (!snap.exists) throw notFound();
  const rec = docData<Parent>(snap);
  if (!canRead(p, rec) && !(type !== 'publication' && (await hasReviewAccess(p, rec.id)))) throw notFound();
  return rec;
}

/** Ai được tải lên / thu hồi tài liệu của hồ sơ, ở trạng thái nào. */
function canWrite(p: Principal, type: string, rec: Parent): boolean {
  if (type === 'proposal' || type === 'publication') {
    return rec.ownerUid === p.uid && ['DRAFT', 'NEEDS_REVISION'].includes(rec.status);
  }
  const pr = rec as Project;
  return (pr.ownerUid === p.uid || pr.memberUids.includes(p.uid)) && ['CONTRACT_PENDING', 'ACTIVE', 'COMPLETION_REVISION'].includes(pr.status);
}

@Controller('documents')
export class DocumentsController {
  /**
   * Tải tệp lên qua API (kiểm tra quyền, loại, dung lượng, chữ ký tệp, checksum) rồi lưu vào bucket riêng tư.
   * Không cấp URL công khai cố định. Xem ADR-0002.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes, files: 1 } }))
  async upload(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown) {
    const b = parse(uploadBody, body);
    if (!file) throw badRequest('Chưa chọn tệp.');
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    const allowedExt = ALLOWED[file.mimetype];
    if (!allowedExt || !allowedExt.includes(ext)) throw unprocessable('FILE_TYPE_NOT_ALLOWED', 'Loại tệp không được phép (PDF, Word, Excel, PowerPoint, ảnh PNG/JPG, TXT, CSV).');
    if (!sniffOk(file.buffer, file.mimetype)) throw unprocessable('FILE_CONTENT_MISMATCH', 'Nội dung tệp không khớp với định dạng khai báo.');

    const parent = await loadParent(p, b.parentType, b.parentId);
    if (!canWrite(p, b.parentType, parent)) throw forbidden('Bạn không được tải tài liệu lên hồ sơ ở trạng thái hiện tại.');
    if (b.milestoneId) {
      if (b.parentType !== 'project') throw badRequest('milestoneId chỉ dùng cho đề tài.');
      const m = await tcol(p.tenantId, 'projects').doc(b.parentId).collection('milestones').doc(b.milestoneId).get();
      if (!m.exists) throw notFound('Không tìm thấy mốc.');
    }

    const ref = tcol(p.tenantId, 'documents').doc();
    const storagePath = `tenants/${p.tenantId}/${b.parentType}/${b.parentId}/${ref.id}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await files().save(storagePath, file.buffer, { contentType: file.mimetype, metadata: { tenantId: p.tenantId, uploadedBy: p.uid, sha256 } });
    const meta: Omit<DocumentMeta, 'id'> = {
      tenantId: p.tenantId,
      parentType: b.parentType,
      parentId: b.parentId,
      checklistKey: b.checklistKey ?? null,
      milestoneId: b.milestoneId ?? null,
      fileName,
      contentType: file.mimetype,
      size: file.size,
      sha256,
      storagePath,
      uploadedBy: p.uid,
      uploadedByName: p.displayName,
      uploadedAt: nowIso(),
      classification: 'INTERNAL',
      status: 'ACTIVE',
    };
    await ref.set(meta);
    await audit({ actor: p, action: 'document.upload', resourceType: 'document', resourceId: ref.id, requestId: rid, detail: `${b.parentType}/${b.parentId}` });
    return { id: ref.id, ...meta };
  }

  /** Tải xuống: kiểm tra lại quyền đọc hồ sơ cha tại thời điểm tải, ghi audit. */
  @Get(':id/download')
  async download(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Res() res: Response) {
    const snap = await tcol(p.tenantId, 'documents').doc(id).get();
    if (!snap.exists) throw notFound();
    const meta = docData<DocumentMeta>(snap);
    if (meta.status !== 'ACTIVE') throw notFound('Tài liệu đã bị thu hồi.');
    await loadParent(p, meta.parentType, meta.parentId);
    const buf = await files().read(meta.storagePath);
    await audit({ actor: p, action: 'document.download', resourceType: 'document', resourceId: id, requestId: rid });
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buf);
  }

  /** Thu hồi tài liệu (đánh dấu REVOKED, giữ metadata cho lịch sử; xóa bản lưu). */
  @Delete(':id')
  async revoke(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    const ref = tcol(p.tenantId, 'documents').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw notFound();
    const meta = docData<DocumentMeta>(snap);
    const parent = await loadParent(p, meta.parentType, meta.parentId);
    if (!canWrite(p, meta.parentType, parent) || meta.uploadedBy !== p.uid) throw forbidden('Bạn không được thu hồi tài liệu này.');
    if (meta.milestoneId) {
      const m = await tcol(p.tenantId, 'projects').doc(meta.parentId).collection('milestones').doc(meta.milestoneId).get();
      if (m.exists && m.get('status') !== 'OPEN') throw forbidden('Sản phẩm đã nộp; không thu hồi tệp minh chứng.');
    }
    // Hồ sơ đã nộp giữ snapshot tham chiếu documentIds — chỉ cho thu hồi tệp chưa nằm trong bản nộp nào.
    if (meta.parentType === 'proposal') {
      const revs = await tcol(p.tenantId, 'proposals').doc(meta.parentId).collection('revisions').get();
      if (revs.docs.some((r) => (r.get('snapshot.documentIds') as string[] | undefined)?.includes(id))) {
        throw forbidden('Tệp thuộc một bản đã nộp; không thể thu hồi. Hãy tải lên tệp mới.');
      }
    }
    await ref.update({ status: 'REVOKED', revokedAt: nowIso(), revokedBy: p.uid });
    await files().remove(meta.storagePath);
    await audit({ actor: p, action: 'document.revoke', resourceType: 'document', resourceId: id, requestId: rid });
    return { id, status: 'REVOKED' };
  }
}
