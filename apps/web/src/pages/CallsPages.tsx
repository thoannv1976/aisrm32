import type { Call, FormField } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, KeyValue, Loading, PageHeader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';

type CallRow = Call & { isOpenNow: boolean };
const LEVEL: Record<Call['level'], string> = { UNIVERSITY: 'Cấp trường', UNIT: 'Cấp đơn vị', STUDENT: 'Sinh viên' };
const CALL_STATUS: Record<Call['status'], string> = { DRAFT: 'Chưa mở', OPEN: 'Đang mở', CLOSED: 'Đã đóng' };

function CallStatus({ c }: { c: CallRow }) {
  if (c.status === 'OPEN' && !c.isOpenNow) return <StatusBadge status="SUSPENDED" label="Ngoài thời gian nhận" />;
  return <StatusBadge status={c.status === 'OPEN' ? 'ACTIVE' : c.status === 'CLOSED' ? 'ARCHIVED' : 'DRAFT'} label={CALL_STATUS[c.status]} />;
}

function CreateProposalButton({ call }: { call: CallRow }) {
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: () => api<{ id: string }>('/proposals', { method: 'POST', body: { callId: call.id, title: '' } }),
    onSuccess: (r) => nav(`/proposals/${r.id}`),
  });
  if (!call.isOpenNow) return null;
  return (
    <div>
      <button className="btn btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? 'Đang tạo…' : '+ Tạo hồ sơ đề xuất'}
      </button>
      {m.error && <ErrorBox error={m.error} />}
    </div>
  );
}

export function CallsPage() {
  const q = useQuery({ queryKey: ['calls'], queryFn: () => api<{ items: CallRow[]; canManage: boolean }>('/calls') });
  return (
    <>
      <PageHeader
        title="Đợt đăng ký"
        subtitle="Các đợt đăng ký đề tài đang mở và đã kết thúc"
        actions={
          q.data?.canManage && (
            <Link to="/calls/new" className="btn btn-primary">
              + Mở đợt mới
            </Link>
          )
        }
      />
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data?.items.map((c) => (
          <article key={c.id} className="card flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">
                  {c.code} · {LEVEL[c.level]}
                </div>
                <Link to={`/calls/${c.id}`} className="link text-base">
                  {c.title}
                </Link>
              </div>
              <CallStatus c={c} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.description}</p>
            <div className="mt-3 text-sm text-slate-600">
              Nhận hồ sơ: {fmtDate(c.openAt)} – <strong>{fmtDateTime(c.closeAt)}</strong>
              {c.expertReview && <span className="ml-2 rounded bg-indigo-50 px-1.5 text-xs text-indigo-700">Có bước thẩm định</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <CreateProposalButton call={c} />
              <Link to={`/calls/${c.id}`} className="btn">
                Xem chi tiết
              </Link>
            </div>
          </article>
        ))}
      </div>
      {q.data?.items.length === 0 && <Empty>Chưa có đợt đăng ký nào.</Empty>}
    </>
  );
}

export function CallDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['calls', id], queryFn: () => api<{ item: CallRow; canManage: boolean }>(`/calls/${id}`) });
  const status = useMutation({
    mutationFn: (s: 'OPEN' | 'CLOSED') => api(`/calls/${id}/status`, { method: 'POST', body: { status: s, expectedVersion: q.data!.item.version } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const c = q.data!.item;
  return (
    <>
      <PageHeader
        back={<Link to="/calls" className="link">← Đợt đăng ký</Link>}
        title={c.title}
        subtitle={<CallStatus c={c} />}
        actions={
          <>
            <CreateProposalButton call={c} />
            {q.data!.canManage && c.status === 'DRAFT' && (
              <button className="btn btn-primary" onClick={() => status.mutate('OPEN')}>
                Mở nhận hồ sơ
              </button>
            )}
            {q.data!.canManage && c.status === 'OPEN' && (
              <button className="btn btn-danger" onClick={() => confirm('Đóng đợt đăng ký? Không thể mở lại.') && status.mutate('CLOSED')}>
                Đóng đợt
              </button>
            )}
          </>
        }
      />
      <ErrorBox error={status.error} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Thông tin đợt" className="lg:col-span-2">
          <KeyValue
            items={[
              ['Mã đợt', c.code],
              ['Cấp', LEVEL[c.level]],
              ['Bắt đầu nhận', fmtDateTime(c.openAt)],
              ['Hạn nộp', fmtDateTime(c.closeAt)],
              ['Thẩm định / phản biện', c.expertReview ? 'Có' : 'Không (theo cấu hình đợt)'],
              ['Phiên bản biểu mẫu', `v${c.form.version}`],
            ]}
          />
          <h3 className="mt-5 text-sm font-semibold">Mô tả</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{c.description || '—'}</p>
          <h3 className="mt-4 text-sm font-semibold">Điều kiện tham gia</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{c.eligibility || '—'}</p>
        </Card>
        <Card title="Biểu mẫu & hồ sơ yêu cầu">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Nội dung thuyết minh</h3>
          <ul className="mb-4 mt-1 list-disc pl-5 text-sm">
            {c.form.fields.map((f) => (
              <li key={f.key}>
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </li>
            ))}
          </ul>
          <h3 className="text-xs font-semibold uppercase text-slate-500">Tài liệu đính kèm</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {c.form.checklist.map((f) => (
              <li key={f.key}>
                {f.label}
                {f.required ? <span className="text-red-600"> *</span> : <span className="text-slate-500"> (không bắt buộc)</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

const DEFAULT_FIELDS: FormField[] = [
  { key: 'field', label: 'Lĩnh vực nghiên cứu', type: 'select', required: true, options: ['Kinh tế', 'Kinh doanh – Quản lý', 'Luật', 'Ngôn ngữ – Văn hóa', 'Khác'] },
  { key: 'urgency', label: 'Tính cấp thiết', type: 'textarea', required: true },
  { key: 'objective', label: 'Mục tiêu nghiên cứu', type: 'textarea', required: true },
  { key: 'methods', label: 'Phương pháp nghiên cứu', type: 'textarea', required: true },
  { key: 'expectedOutputs', label: 'Sản phẩm dự kiến', type: 'textarea', required: true },
];

export function CallNewPage() {
  const nav = useNavigate();
  const year = new Date().getFullYear();
  const [f, setF] = useState({
    title: '',
    description: '',
    year: year + 1,
    level: 'UNIVERSITY' as Call['level'],
    openAt: new Date().toISOString().slice(0, 10),
    closeAt: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
    eligibility: '',
    expertReview: false,
    fieldsJson: JSON.stringify(DEFAULT_FIELDS, null, 2),
    checklist: 'thuyet_minh|Thuyết minh đề tài|1\ndu_toan|Dự toán kinh phí|1\nly_lich|Lý lịch khoa học|0',
  });
  const m = useMutation({
    mutationFn: () => {
      let fields: FormField[];
      try {
        fields = JSON.parse(f.fieldsJson);
      } catch {
        throw new Error('Cấu hình trường biểu mẫu không phải JSON hợp lệ.');
      }
      const checklist = f.checklist
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [key, label, req] = l.split('|');
          return { key: key.trim(), label: (label ?? key).trim(), required: req?.trim() === '1' };
        });
      return api<{ id: string }>('/calls', {
        method: 'POST',
        body: {
          title: f.title,
          description: f.description,
          year: Number(f.year),
          level: f.level,
          openAt: new Date(f.openAt + 'T00:00:00+07:00').toISOString(),
          closeAt: new Date(f.closeAt + 'T23:59:59+07:00').toISOString(),
          eligibility: f.eligibility,
          expertReview: f.expertReview,
          fields,
          checklist,
        },
      });
    },
    onSuccess: (r) => nav(`/calls/${r.id}`),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHeader back={<Link to="/calls" className="link">← Đợt đăng ký</Link>} title="Mở đợt đăng ký mới" subtitle="Đợt được tạo ở trạng thái Chưa mở; kiểm tra lại rồi bấm Mở nhận hồ sơ." />
      <form
        className="card max-w-3xl space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Tên đợt" required>
          <input className="input mt-1" value={f.title} onChange={set('title')} required minLength={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Năm kế hoạch" required>
            <input className="input mt-1" type="number" value={f.year} onChange={set('year')} />
          </Field>
          <Field label="Cấp" required>
            <select className="input mt-1" value={f.level} onChange={set('level')}>
              {Object.entries(LEVEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.expertReview} onChange={(e) => setF({ ...f, expertReview: e.target.checked })} />
            Có bước thẩm định / phản biện
          </label>
          <Field label="Ngày mở" required>
            <input className="input mt-1" type="date" value={f.openAt} onChange={set('openAt')} />
          </Field>
          <Field label="Hạn nộp" required>
            <input className="input mt-1" type="date" value={f.closeAt} onChange={set('closeAt')} />
          </Field>
        </div>
        <Field label="Mô tả">
          <textarea className="input mt-1" rows={3} value={f.description} onChange={set('description')} />
        </Field>
        <Field label="Điều kiện tham gia">
          <textarea className="input mt-1" rows={2} value={f.eligibility} onChange={set('eligibility')} />
        </Field>
        <Field label="Trường biểu mẫu (JSON)" help="Mỗi trường: key, label, type (text|textarea|number|date|select), required, options. Biểu mẫu có phiên bản; hồ sơ đã tạo giữ phiên bản ban đầu.">
          <textarea className="input mt-1 font-mono text-xs" rows={10} value={f.fieldsJson} onChange={set('fieldsJson')} />
        </Field>
        <Field label="Tài liệu bắt buộc" help="Mỗi dòng: mã|tên tài liệu|1 (bắt buộc) hoặc 0">
          <textarea className="input mt-1 font-mono text-xs" rows={4} value={f.checklist} onChange={set('checklist')} />
        </Field>
        <ErrorBox error={m.error} />
        <div className="flex justify-end gap-2">
          <Link to="/calls" className="btn">
            Hủy
          </Link>
          <button className="btn btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Đang lưu…' : 'Tạo đợt'}
          </button>
        </div>
      </form>
    </>
  );
}
