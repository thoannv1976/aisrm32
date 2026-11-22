import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BarChart, DataTable, DownloadButton, type DataTableSpec } from '../components/extras';
import { Card, Empty, ErrorBox, Field, fmtDateTime, fmtVnd, Loading, Modal } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface Extended {
  generatedAt: string;
  tiles: { key: string; label: string; value: number; definition: string }[];
  tables: DataTableSpec[];
}

export function ExtendedPanel() {
  const q = useQuery({ queryKey: ['dashboard', 'extended'], queryFn: () => api<Extended>('/dashboard/extended') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {d.tiles.map((t) => (
          <div key={t.key} className="card p-3" title={t.definition}>
            <div className="text-xs font-medium text-slate-500">{t.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-brand-800">{t.key.endsWith('_vnd') ? fmtVnd(t.value) : t.value}</div>
            <div className="mt-1 text-[11px] leading-tight text-slate-400">{t.definition}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {d.tables.map((t) => (
          <Card key={t.key} title={t.title}>
            {t.chart && t.rows.length > 0 && <BarChart rows={t.rows} label={t.chart.label} value={t.chart.value} title={t.title} />}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-brand-700">Bảng số liệu</summary>
              <DataTable t={t} />
            </details>
            <p className="mt-2 text-[11px] text-slate-500">Định nghĩa: {t.definition}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface AskResult {
  matched: boolean;
  answer: string;
  table?: DataTableSpec;
  query?: { key: string; label: string };
  choice: { key: string | null; params: Record<string, unknown>; reason: string };
  scope?: string;
  ai: { model: { label: string; provider: string }; mock: boolean } | null;
  note?: string;
  catalog?: { key: string; label: string }[];
}

/** Hỏi đáp số liệu bằng tiếng Việt: AI chọn truy vấn có sẵn, hệ thống tính số, hiển thị bảng + biểu đồ. */
export function AskPanel() {
  const cat = useQuery({ queryKey: ['ask-catalog'], queryFn: () => api<{ items: { key: string; label: string }[]; examples: string[] }>('/dashboard/ask/catalog') });
  const [question, setQuestion] = useState('');
  const ask = useMutation({ mutationFn: (b: { question: string; queryKey?: string }) => api<AskResult>('/dashboard/ask', { method: 'POST', body: b }) });
  const r = ask.data;
  return (
    <Card title="Hỏi đáp số liệu (tiếng Việt)">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), question.trim().length >= 3 && ask.mutate({ question }))}>
        <input className="input min-w-0 flex-1" placeholder="vd: Khoa nào có nhiều đề tài nhất năm 2026?" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Câu hỏi số liệu" />
        <button className="btn btn-primary" disabled={ask.isPending}>{ask.isPending ? 'Đang xử lý…' : 'Hỏi'}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {cat.data?.examples.map((e) => (
          <button key={e} type="button" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs hover:bg-brand-50" onClick={() => (setQuestion(e), ask.mutate({ question: e }))}>
            {e}
          </button>
        ))}
      </div>
      <ErrorBox error={ask.error} />
      {r && (
        <div className="mt-4 space-y-3">
          <p className={`rounded-md p-3 text-sm ${r.matched ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{r.answer}</p>
          {r.table && (
            <>
              {r.table.chart && r.table.rows.length > 0 && <BarChart rows={r.table.rows} label={r.table.chart.label} value={r.table.chart.value} title={r.table.title} />}
              <DataTable t={r.table} />
              <p className="text-xs text-slate-500">
                Truy vấn: <strong>{r.query?.label}</strong>
                {Object.keys(r.choice.params).length > 0 && ` (${Object.entries(r.choice.params).map(([k, v]) => `${k}=${v}`).join(', ')})`} · Phạm vi: {r.scope} · Định nghĩa: {r.table.definition}
              </p>
            </>
          )}
          {!r.matched && (
            <div className="flex flex-wrap gap-1">
              {(r.catalog ?? cat.data?.items ?? []).map((c) => (
                <button key={c.key} type="button" className="btn text-xs" onClick={() => ask.mutate({ question: c.label, queryKey: c.key })}>{c.label}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            {r.note ?? 'AI chỉ chọn truy vấn; số liệu do hệ thống tính.'} {r.ai && `Chọn truy vấn bằng ${r.ai.model.label}${r.ai.mock ? ' (giả lập: khớp từ khóa)' : ''}.`}
          </p>
        </div>
      )}
    </Card>
  );
}

interface Snapshot {
  id: string;
  label: string;
  period: string;
  scope: string;
  createdAt: string;
  createdByName: string;
}

export function SnapshotsPanel() {
  const { hasRole } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['snapshots'], queryFn: () => api<{ items: Snapshot[] }>('/dashboard/snapshots') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: '', period: '' });
  const [view, setView] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['snapshot', view], queryFn: () => api<{ label: string; metrics: { tiles: { key: string; label: string; value: number }[] }; extended: Extended; createdAt: string }>(`/dashboard/snapshots/${view}`), enabled: !!view });
  const create = useMutation({ mutationFn: () => api('/dashboard/snapshots', { method: 'POST', body: f }), onSuccess: () => (setOpen(false), qc.invalidateQueries({ queryKey: ['snapshots'] })) });
  return (
    <Card title="Chốt kỳ số liệu" actions={hasRole('SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR') && <button className="btn text-xs" onClick={() => setOpen(true)}>🔒 Chốt kỳ</button>}>
      <p className="mb-2 text-xs text-slate-500">Chốt kỳ lưu bất biến bộ số liệu tại thời điểm chốt để báo cáo kỳ (quý, năm học) luôn khớp, kể cả khi dữ liệu thay đổi sau đó.</p>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : q.data!.items.length === 0 ? <Empty>Chưa chốt kỳ nào.</Empty> : (
        <ul className="divide-y text-sm">
          {q.data!.items.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <div>
                <strong>{s.label}</strong> <span className="text-xs text-slate-500">({s.period})</span>
                <div className="text-xs text-slate-500">{s.createdByName} · {fmtDateTime(s.createdAt)} · {s.scope}</div>
              </div>
              <button className="btn text-xs" onClick={() => setView(s.id)}>Xem</button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} title="Chốt kỳ số liệu" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Tên kỳ" required>
            <input className="input mt-1" required minLength={3} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="vd: Báo cáo năm học 2025–2026" />
          </Field>
          <Field label="Kỳ" required>
            <input className="input mt-1" required value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="vd: 2025-2026 hoặc Q4/2026" />
          </Field>
          <ErrorBox error={create.error} />
          <div className="flex justify-end"><button className="btn btn-primary" disabled={create.isPending}>Chốt</button></div>
        </form>
      </Modal>
      <Modal open={!!view} title={detail.data?.label ?? 'Số liệu đã chốt'} onClose={() => setView(null)}>
        {detail.isLoading ? <Loading /> : detail.data && (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            <p className="text-xs text-slate-500">Chốt lúc {fmtDateTime(detail.data.createdAt)}</p>
            <table className="table">
              <tbody>
                {[...detail.data.metrics.tiles, ...detail.data.extended.tiles].map((t) => (
                  <tr key={t.key}><td>{t.label}</td><td className="text-right tabular-nums">{t.key.endsWith('_vnd') ? fmtVnd(t.value) : t.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function ExportsBar() {
  const { hasRole } = useSession();
  return (
    <div className="flex flex-wrap gap-2">
      <DownloadButton path="/exports/datasets/proposals" name="de_xuat.xlsx" label="⬇ Đề xuất (Excel)" />
      <DownloadButton path="/exports/datasets/projects" name="de_tai.xlsx" label="⬇ Đề tài (Excel)" />
      <DownloadButton path="/exports/datasets/publications" name="cong_bo.xlsx" label="⬇ Công bố (Excel)" />
      {hasRole('SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR') && <DownloadButton path="/exports/datasets/finance" name="kinh_phi.xlsx" label="⬇ Kinh phí (Excel)" />}
      {hasRole('SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR') && <DownloadButton path="/exports/hemis-xlsx" name="HEMIS.xlsx" label="⬇ Báo cáo HEMIS (Excel)" className="btn btn-primary" />}
    </div>
  );
}
