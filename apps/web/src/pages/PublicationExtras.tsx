import { catLabel, JOURNAL_SCOPES, PUBLICATION_TYPE_LABELS, QUARTILES, type JournalScope, type Publication, type PublicationType, type Quartile } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AiMeta } from '../components/ai';
import { Card, Empty, ErrorBox, Field, fmtDateTime, KeyValue, Loading, PageHeader } from '../components/ui';
import { api } from '../lib/api';

export interface ExtractedPublication {
  title: string | null;
  authors: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  type: PublicationType;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  issn: string | null;
  isbn: string | null;
  publisher: string | null;
}

/** Tải PDF bài báo → quy tắc + AI trích thông tin để điền sẵn biểu mẫu (người dùng kiểm tra lại). */
export function PdfExtract({ onApply }: { onApply: (x: ExtractedPublication) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const m = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set('file', file);
      return api<Parameters<typeof AiMeta>[0]['d'] & { extracted: ExtractedPublication; text: string }>('/publications/extract-pdf', { method: 'POST', body: fd });
    },
    onSuccess: (r) => onApply(r.extracted),
  });
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) m.mutate(f); e.target.value = ''; }} />
        <button type="button" className="btn text-xs" disabled={m.isPending} onClick={() => input.current?.click()}>
          {m.isPending ? 'Đang đọc PDF…' : '✨ Điền từ tệp PDF'}
        </button>
        <span className="text-xs text-slate-600">Tải bản PDF bài báo / sách: hệ thống trích tiêu đề, tác giả, DOI, tập/số/trang… để điền sẵn. Tệp không được lưu.</span>
      </div>
      <ErrorBox error={m.error} />
      {m.data && (
        <div className="mt-2">
          <p className="text-xs text-slate-700">{m.data.text} Các trường đã điền: kiểm tra lại trước khi lưu.</p>
          <AiMeta d={m.data} />
        </div>
      )}
    </div>
  );
}

export interface HemisPubFields {
  volume: string;
  issue: string;
  pages: string;
  issn: string;
  isbn: string;
  publisher: string;
}

export function HemisPubInputs({ f, onChange, type }: { f: HemisPubFields; onChange: (f: HemisPubFields) => void; type: PublicationType }) {
  const book = type === 'BOOK' || type === 'BOOK_CHAPTER';
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-600">Thông tin theo HEMIS</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {!book && (
          <>
            <Field label="Tập (Volume)">
              <input className="input mt-1" value={f.volume} onChange={(e) => onChange({ ...f, volume: e.target.value })} />
            </Field>
            <Field label="Số (Issue)">
              <input className="input mt-1" value={f.issue} onChange={(e) => onChange({ ...f, issue: e.target.value })} />
            </Field>
            <Field label="ISSN">
              <input className="input mt-1" value={f.issn} onChange={(e) => onChange({ ...f, issn: e.target.value })} placeholder="1234-5678" />
            </Field>
          </>
        )}
        <Field label="Trang">
          <input className="input mt-1" value={f.pages} onChange={(e) => onChange({ ...f, pages: e.target.value })} placeholder="vd: 45-58" />
        </Field>
        {book && (
          <>
            <Field label="ISBN">
              <input className="input mt-1" value={f.isbn} onChange={(e) => onChange({ ...f, isbn: e.target.value })} />
            </Field>
            <Field label="Nhà xuất bản">
              <input className="input mt-1" value={f.publisher} onChange={(e) => onChange({ ...f, publisher: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** Phạm vi tạp chí, xếp hạng Q — Phòng KH xác nhận theo nguồn (ghi rõ nguồn). */
export function ClassificationCard({ p, canEdit }: { p: Publication; canEdit: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ journalScope: p.journalScope ?? null, quartile: p.quartile ?? null, quartileSource: p.quartileSource ?? '' });
  const save = useMutation({
    mutationFn: () => api(`/publications/${p.id}/classification`, { method: 'PUT', body: { ...f, quartileSource: f.quartileSource || null } }),
    onSuccess: () => (setEdit(false), qc.invalidateQueries({ queryKey: ['publications', p.id] })),
  });
  return (
    <Card title="Phân loại tạp chí (HEMIS)" actions={canEdit && !edit && <button className="btn text-xs" onClick={() => setEdit(true)}>✎ Xác nhận phân loại</button>}>
      {edit ? (
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Phạm vi tạp chí">
            <select className="input mt-1" value={f.journalScope ?? ''} onChange={(e) => setF({ ...f, journalScope: (e.target.value || null) as JournalScope | null })}>
              <option value="">— Chưa xác định —</option>
              {Object.entries(JOURNAL_SCOPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Xếp hạng">
              <select className="input mt-1" value={f.quartile ?? ''} onChange={(e) => setF({ ...f, quartile: (e.target.value || null) as Quartile | null })}>
                <option value="">—</option>
                {QUARTILES.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </Field>
            <Field label="Nguồn xếp hạng" help="Bắt buộc khi có xếp hạng, vd: SCImago 2025">
              <input className="input mt-1" value={f.quartileSource} onChange={(e) => setF({ ...f, quartileSource: e.target.value })} />
            </Field>
          </div>
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setEdit(false)}>Hủy</button>
            <button className="btn btn-primary" disabled={save.isPending}>Lưu</button>
          </div>
        </form>
      ) : (
        <>
          <KeyValue items={[['Phạm vi', catLabel(JOURNAL_SCOPES, p.journalScope)], ['Xếp hạng', p.quartile ? `${p.quartile} — nguồn: ${p.quartileSource}` : '—'], ['Tập / số / trang', [p.volume, p.issue, p.pages].filter(Boolean).join(' / ') || '—'], ['ISSN / ISBN', p.issn ?? p.isbn ?? '—']]} />
          <p className="mt-2 text-xs text-slate-500">AI không tự kết luận Scopus/WoS/Q; cán bộ Phòng KH xác nhận theo nguồn tra cứu.</p>
        </>
      )}
    </Card>
  );
}

interface OrcidCheck {
  checkedAt: string;
  checkedByName: string;
  authors: { name: string; orcid: string; found: boolean; status: string; message: string }[];
  note: string | null;
}

/** Kiểm chứng ORCID + AI giải thích kết quả kiểm chứng (Crossref + ORCID). */
export function OrcidVerifyCard({ id, initial, canVerify }: { id: string; initial: OrcidCheck | null; canVerify: boolean }) {
  const qc = useQueryClient();
  const v = useMutation({ mutationFn: () => api<OrcidCheck>(`/publications/${id}/verify-orcid`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['publications', id] }) });
  const ex = useMutation({ mutationFn: () => api<Parameters<typeof AiMeta>[0]['d'] & { text: string }>(`/publications/${id}/explain-verification`, { method: 'POST' }) });
  const r = v.data ?? initial;
  const tone: Record<string, string> = { MATCH_DOI: 'text-emerald-700', MATCH_TITLE: 'text-emerald-700', NOT_IN_ORCID: 'text-amber-700', NO_ORCID: 'text-slate-500', ERROR: 'text-red-700' };
  return (
    <Card
      title="Kiểm chứng ORCID"
      actions={
        canVerify && (
          <span className="flex gap-2">
            <button className="btn text-xs" disabled={v.isPending} onClick={() => v.mutate()}>
              {v.isPending ? 'Đang tra ORCID…' : '🔎 Kiểm chứng ORCID'}
            </button>
            <button className="btn text-xs" disabled={ex.isPending} onClick={() => ex.mutate()} title="AI giải thích kết quả kiểm chứng Crossref và ORCID">
              ✨ Giải thích kết quả
            </button>
          </span>
        )
      }
    >
      <ErrorBox error={v.error ?? ex.error} />
      {r ? (
        <>
          {r.note && <p className="text-sm text-slate-600">{r.note}</p>}
          <ul className="space-y-1 text-sm">
            {r.authors.map((a, i) => (
              <li key={i} className={tone[a.status] ?? ''}>
                <strong>{a.name}</strong> {a.orcid && <a className="link font-mono text-xs" href={`https://orcid.org/${a.orcid}`} target="_blank" rel="noreferrer noopener">{a.orcid}</a>}: {a.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Kiểm chứng lúc {fmtDateTime(r.checkedAt)} bởi {r.checkedByName}. Không thấy trong ORCID không có nghĩa công bố sai — có thể tác giả chưa cập nhật ORCID.</p>
        </>
      ) : (
        <Empty>Chưa kiểm chứng ORCID. Tác giả trong trường cần khai ORCID ở Hồ sơ khoa học.</Empty>
      )}
      {ex.data && (
        <div className="mt-3 rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <div className="mb-1 text-xs font-semibold text-violet-900">AI giải thích kết quả kiểm chứng</div>
          <p className="whitespace-pre-wrap text-sm">{ex.data.text}</p>
          <AiMeta d={ex.data} />
        </div>
      )}
    </Card>
  );
}

interface OrcidWork {
  putCode: string;
  title: string;
  type: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  alreadyInSystem: boolean;
}

/** Nhập công bố từ ORCID của chính mình thành bản nháp. */
export function OrcidImportPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['orcid-works'], queryFn: () => api<{ orcid: string; ok: boolean; message: string; works: OrcidWork[] }>('/me/orcid/works'), retry: false });
  const [sel, setSel] = useState<string[]>([]);
  const imp = useMutation({ mutationFn: () => api<{ created: { id: string; code: string; title: string }[]; skipped: string[]; note: string }>('/me/orcid/import', { method: 'POST', body: { putCodes: sel } }), onSuccess: () => (setSel([]), qc.invalidateQueries()) });
  return (
    <>
      <PageHeader back={<Link to="/publications" className="link">← Công bố</Link>} title="Nhập công bố từ ORCID" subtitle="Lấy danh sách công trình công khai trên ORCID của bạn, chọn công trình chưa có để tạo bản nháp khai báo." />
      {q.isLoading ? (
        <Loading label="Đang tra ORCID…" />
      ) : q.error ? (
        <div className="space-y-2">
          <ErrorBox error={q.error} />
          <Link className="link text-sm" to="/profile">→ Khai báo ORCID ở Hồ sơ khoa học</Link>
        </div>
      ) : (
        <div className="card p-4">
          <p className="mb-3 text-sm">
            ORCID <a className="link font-mono" href={`https://orcid.org/${q.data!.orcid}`} target="_blank" rel="noreferrer noopener">{q.data!.orcid}</a>: {q.data!.message}
          </p>
          {q.data!.works.length === 0 ? (
            <Empty>Không có công trình công khai.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Công trình</th>
                  <th>Loại</th>
                  <th>Năm</th>
                  <th>DOI</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.works.map((w) => (
                  <tr key={w.putCode} className={w.alreadyInSystem ? 'text-slate-400' : ''}>
                    <td>
                      <input type="checkbox" aria-label={`Chọn ${w.title}`} disabled={w.alreadyInSystem} checked={sel.includes(w.putCode)} onChange={(e) => setSel(e.target.checked ? [...sel, w.putCode] : sel.filter((x) => x !== w.putCode))} />
                    </td>
                    <td>
                      {w.title}
                      <div className="text-xs text-slate-500">{w.venue}{w.alreadyInSystem && ' · đã có trong AI-SRM'}</div>
                    </td>
                    <td className="text-xs">{w.type}</td>
                    <td>{w.year ?? '—'}</td>
                    <td className="font-mono text-xs">{w.doi ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-primary" disabled={sel.length === 0 || imp.isPending} onClick={() => imp.mutate()}>
              Tạo {sel.length} bản nháp
            </button>
            <ErrorBox error={imp.error} />
          </div>
          {imp.data && (
            <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              Đã tạo {imp.data.created.length} bản nháp: {imp.data.created.map((c) => <Link key={c.id} className="link mr-2" to={`/publications/${c.id}`}>{c.code}</Link>)}
              {imp.data.skipped.length > 0 && <div>Bỏ qua (trùng DOI): {imp.data.skipped.join('; ')}</div>}
              <div className="text-xs">{imp.data.note}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export const typeLabel = (t: PublicationType) => PUBLICATION_TYPE_LABELS[t];
