import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { hasAnyRole, parseRegulationText, type Principal, type Role } from '@aisrm/shared';
import { z } from 'zod';
import { askRegulation, saveRegulation, touchIndex, type RegChunk, type RegulationMeta } from '../regulation/service';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../common/errors';
import { nowIso, tcol } from '../common/firebase';
import { audit } from '../common/records';
import { docData, parse } from '../common/util';

const MANAGERS: Role[] = ['SCIENCE_OFFICER', 'SCIENCE_HEAD', 'SYS_ADMIN'];
const requireManager = (p: Principal) => {
  if (!hasAnyRole(p, MANAGERS)) throw forbidden('Chỉ Phòng Quản lý khoa học / quản trị hệ thống được quản lý văn bản quy chế.');
};

const uploadBody = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[\w.-]+$/, 'Mã văn bản chỉ gồm chữ, số, . - _'),
  title: z.string().trim().min(3).max(300),
  issuer: z.string().trim().max(200).optional().nullable(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
  dryRun: z.enum(['true', 'false']).optional(),
});
const askBody = z.object({ question: z.string().trim().min(3, 'Câu hỏi quá ngắn.').max(500, 'Câu hỏi tối đa 500 ký tự.') });

const MAX_BYTES = 5 * 1024 * 1024;

async function extractText(file: Express.Multer.File, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (ext === '.docx') {
    if (!(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b)) throw unprocessable('FILE_CONTENT_MISMATCH', 'Tệp .docx không hợp lệ.');
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  }
  if (ext === '.txt' || ext === '.md') {
    const t = file.buffer.toString('utf8');
    if (t.includes('\u0000')) throw unprocessable('FILE_CONTENT_MISMATCH', 'Tệp văn bản không hợp lệ.');
    return t;
  }
  throw unprocessable('FILE_TYPE_NOT_ALLOWED', 'Chỉ nhận tệp Word (.docx), .txt hoặc .md. Văn bản PDF cần chuyển sang Word trước.');
}

@Controller('regulations')
export class RegulationsController {
  /** Danh sách văn bản quy chế (mọi thành viên xem được văn bản đang hiệu lực). */
  @Get()
  async list(@CurrentPrincipal() p: Principal) {
    const manager = hasAnyRole(p, MANAGERS);
    const snap = await tcol(p.tenantId, 'regulations').get();
    const items = snap.docs
      .map((d) => docData<RegulationMeta>(d))
      .filter((r) => manager || r.status === 'ACTIVE')
      .sort((a, b) => a.code.localeCompare(b.code));
    return { items, canManage: manager };
  }

  /** Toàn văn theo điều khoản — để người dùng đối chiếu câu trả lời. */
  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const s = await tcol(p.tenantId, 'regulations').doc(id).get();
    if (!s.exists) throw notFound();
    const meta = docData<RegulationMeta>(s);
    if (meta.status !== 'ACTIVE' && !hasAnyRole(p, MANAGERS)) throw notFound();
    const chunks = (await tcol(p.tenantId, 'regulationChunks').where('regId', '==', id).get()).docs.map((d) => docData<RegChunk>(d));
    chunks.sort((a, b) => a.article - b.article || a.clause - b.clause);
    const articles: { chapter: string | null; number: number; title: string; clauses: { no: number; text: string; ref: string }[] }[] = [];
    for (const c of chunks) {
      let a = articles.at(-1);
      if (!a || a.number !== c.article) articles.push((a = { chapter: c.chapter, number: c.article, title: c.articleTitle, clauses: [] }));
      a.clauses.push({ no: c.clause, text: c.text, ref: c.id });
    }
    return { item: meta, articles };
  }

  /** Nạp văn bản (.docx/.txt/.md): tách Chương/Điều/Khoản, lập chỉ mục. dryRun=true chỉ xem trước kết quả tách. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  async upload(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown) {
    requireManager(p);
    const b = parse(uploadBody, body);
    if (!file) throw badRequest('Chưa chọn tệp.');
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
    const parsed = parseRegulationText(await extractText(file, fileName));
    if (!parsed.articles.length) throw unprocessable('NO_ARTICLES', 'Không nhận diện được điều khoản nào. Văn bản cần có các dòng bắt đầu bằng "Điều 1.", "Điều 2."…', parsed.warnings);
    const preview = {
      heading: parsed.heading,
      articleCount: parsed.articles.length,
      clauseCount: parsed.articles.reduce((n, a) => n + a.clauses.length, 0),
      chapters: [...new Set(parsed.articles.map((a) => a.chapter).filter(Boolean))],
      firstArticles: parsed.articles.slice(0, 3).map((a) => `Điều ${a.number}. ${a.title}`),
      warnings: parsed.warnings,
    };
    if (b.dryRun === 'true') return { dryRun: true, preview };
    const meta = await saveRegulation(p.tenantId, { ...b, sourceFileName: fileName }, parsed, { uid: p.uid, name: p.displayName });
    await audit({ actor: p, action: 'regulation.upload', resourceType: 'regulation', resourceId: meta.id, requestId: rid, detail: `${meta.code} v${meta.version}` });
    return { dryRun: false, preview, item: meta };
  }

  @Patch(':id')
  async setStatus(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    requireManager(p);
    const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }), body);
    const ref = tcol(p.tenantId, 'regulations').doc(id);
    if (!(await ref.get()).exists) throw notFound();
    await ref.update({ status, updatedAt: nowIso() });
    await touchIndex(p.tenantId);
    await audit({ actor: p, action: `regulation.${status === 'ACTIVE' ? 'activate' : 'deactivate'}`, resourceType: 'regulation', resourceId: id, requestId: rid });
    return { id, status };
  }

  /** Hỏi đáp: mọi thành viên. Không lưu nội dung câu hỏi vào nhật ký (chỉ ghi lượt dùng AI). */
  @Post('ask')
  async ask(@CurrentPrincipal() p: Principal, @Body() body: unknown) {
    const { question } = parse(askBody, body);
    return askRegulation(p, question);
  }
}
