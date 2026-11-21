import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Empty, ErrorBox, fmtDateTime, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';

interface Job {
  id: string;
  type: 'outbound' | 'import_org' | 'reconcile' | 'backfill';
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
  startedByName: string;
  counts?: Record<string, number>;
  itemCount?: number;
  replayOf?: string;
  items?: { key: string; result: string; message: string | null }[];
}

interface Status {
  settings: { mode: 'disabled' | 'mock' | 'live'; failureRatePct: number };
  contract: string;
  outbox: Record<string, number>;
  mockEntityCounts: Record<string, number>;
  jobs: Job[];
}

const JOB_LABEL: Record<Job['type'], string> = {
  outbound: 'Gửi dữ liệu (outbox)',
  backfill: 'Đồng bộ ban đầu (backfill)',
  import_org: 'Nhận danh mục đơn vị/cán bộ',
  reconcile: 'Đối soát',
};
const RESULT_LABEL: Record<string, string> = {
  ACCEPTED: 'Đã nhận',
  DUPLICATE: 'Trùng (bỏ qua)',
  STALE_IGNORED: 'Phiên bản cũ (bỏ qua)',
  SKIPPED: 'Ngoài phạm vi xuất',
  FAILED: 'Lỗi — sẽ thử lại',
  DEAD: 'Lỗi quá số lần thử',
  UNCHANGED: 'Không đổi',
  CHANGED: 'Khác biệt',
  NEW_IN_UNI: 'Mới trên UNI',
  MISSING_IN_UNI: 'Thiếu trên UNI',
  MATCHED: 'Khớp',
  QUEUED: 'Đã đưa vào hàng chờ',
  UP_TO_DATE: 'UNI đã có bản mới nhất',
  VERSION_MISMATCH: 'Lệch phiên bản',
  EXTRA_IN_UNI: 'Thừa trên UNI',
};
const BAD = new Set(['FAILED', 'DEAD', 'CHANGED', 'MISSING_IN_UNI', 'VERSION_MISMATCH', 'EXTRA_IN_UNI', 'NEW_IN_UNI']);

function JobDetail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['sync-job', id], queryFn: () => api<Job>(`/integrations/uni-data360/jobs/${id}`) });
  if (q.isLoading) return <Loading />;
  const items = q.data?.items ?? [];
  if (!items.length) return <p className="text-sm text-slate-500">Không có bản ghi chi tiết.</p>;
  return (
    <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
      {items.map((i, n) => (
        <li key={n} className="flex flex-wrap items-center gap-2 py-1.5">
          <StatusBadge status={BAD.has(i.result) ? (i.result === 'FAILED' || i.result === 'DEAD' ? 'REJECTED' : 'NEEDS_REVISION') : 'APPROVED'} label={RESULT_LABEL[i.result] ?? i.result} />
          <span className="text-slate-700">{i.message}</span>
          <span className="font-mono text-xs text-slate-400">{i.key}</span>
        </li>
      ))}
    </ul>
  );
}

function SyncTab({ s }: { s: Status }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [fail, setFail] = useState(s.settings.failureRatePct);
  const refresh = () => qc.invalidateQueries({ queryKey: ['uni-status'] });
  const run = useMutation({ mutationFn: (type: Job['type']) => api<Job>('/integrations/uni-data360/sync-jobs', { method: 'POST', body: { type } }), onSuccess: (j) => (setOpen(j.id), refresh()) });
  const replay = useMutation({ mutationFn: (id: string) => api<Job>(`/integrations/uni-data360/sync-jobs/${id}/replay`, { method: 'POST' }), onSuccess: (j) => (setOpen(j.id), refresh()) });
  const settings = useMutation({ mutationFn: (body: Status['settings']) => api('/integrations/uni-data360/settings', { method: 'PUT', body }), onSuccess: refresh });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED'] as const).map((k) => (
          <div key={k} className="card p-3">
            <div className="text-xs text-slate-500">Outbox · {k === 'PENDING' ? 'Chờ gửi' : k === 'SENT' ? 'Đã gửi' : k === 'FAILED' ? 'Lỗi, chờ thử lại' : k === 'DEAD' ? 'Lỗi quá số lần' : 'Ngoài phạm vi'}</div>
            <div className={`text-xl font-semibold ${(k === 'FAILED' || k === 'DEAD') && s.outbox[k] ? 'text-red-700' : 'text-brand-800'}`}>{s.outbox[k] ?? 0}</div>
          </div>
        ))}
      </div>
      <Card title="Thao tác đồng bộ">
        <div className="flex flex-wrap gap-2">
          {(['outbound', 'backfill', 'import_org', 'reconcile'] as const).map((t) => (
            <button key={t} className={`btn ${t === 'outbound' ? 'btn-primary' : ''}`} disabled={run.isPending || s.settings.mode === 'disabled'} onClick={() => run.mutate(t)}>
              {JOB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="label">
            Chế độ kết nối
            <select className="input mt-1" value={s.settings.mode} onChange={(e) => settings.mutate({ ...s.settings, mode: e.target.value as Status['settings']['mode'] })}>
              <option value="mock">Giả lập (mock)</option>
              <option value="disabled">Tắt</option>
              <option value="live" disabled>
                Thật (chưa có hợp đồng API)
              </option>
            </select>
          </label>
          <label className="label">
            Tiêm lỗi giả lập (%)
            <input className="input mt-1 w-28" type="number" min={0} max={90} value={fail} onChange={(e) => setFail(Number(e.target.value))} />
          </label>
          <button className="btn" onClick={() => settings.mutate({ ...s.settings, failureRatePct: fail })}>
            Áp dụng
          </button>
          <p className="text-xs text-slate-500">Dùng để kiểm thử thử lại / phát lại khi UNI mất kết nối.</p>
        </div>
        <ErrorBox error={run.error ?? replay.error ?? settings.error} />
      </Card>
      <Card title="Lịch sử phiên đồng bộ">
        {s.jobs.length === 0 ? (
          <Empty>Chưa chạy phiên nào.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {s.jobs.map((j) => (
              <li key={j.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <strong>{JOB_LABEL[j.type]}</strong>
                    {j.replayOf && <span className="text-xs text-slate-500"> (phát lại)</span>} · {fmtDateTime(j.startedAt)} · {j.startedByName}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={j.status === 'SUCCESS' ? 'APPROVED' : j.status === 'PARTIAL' ? 'NEEDS_REVISION' : j.status === 'FAILED' ? 'REJECTED' : 'ACTIVE'} label={j.status === 'SUCCESS' ? 'Thành công' : j.status === 'PARTIAL' ? 'Thành công một phần' : j.status === 'FAILED' ? 'Thất bại' : 'Đang chạy'} />
                    {j.type === 'outbound' && (j.counts?.FAILED || j.counts?.DEAD) ? (
                      <button className="btn btn-primary text-xs" disabled={replay.isPending} onClick={() => replay.mutate(j.id)}>
                        Phát lại lỗi
                      </button>
                    ) : null}
                    <button className="btn text-xs" onClick={() => setOpen(open === j.id ? null : j.id)}>
                      {open === j.id ? 'Ẩn' : 'Chi tiết'}
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                  {Object.entries(j.counts ?? {})
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span key={k} className={`rounded px-1.5 py-0.5 ${BAD.has(k) ? 'bg-amber-50 text-amber-900' : 'bg-slate-100'}`}>
                        {RESULT_LABEL[k] ?? k}: {v}
                      </span>
                    ))}
                </div>
                {open === j.id && (
                  <div className="mt-2 rounded-md border border-slate-200 p-2">
                    <JobDetail id={j.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface HemisRecord {
  table: string;
  sourceCode: string;
  record: Record<string, unknown>;
  missingRequired: string[];
  warnings: string[];
}

function HemisTab() {
  const [entity, setEntity] = useState<'projects' | 'publications'>('projects');
  const q = useQuery({ queryKey: ['hemis', entity], queryFn: () => api<{ standard: string; records: HemisRecord[] }>(`/integrations/uni-data360/hemis-preview?entity=${entity}`) });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Xem trước — chưa gửi HEMIS.</strong> Ánh xạ dữ liệu AI-SRM sang chuẩn "API đồng bộ dữ liệu NCKH" (mục 12, tài liệu HEMIS v1.0) để rà soát trường bắt buộc còn thiếu. Kết nối thật đi theo lộ trình AI-SRM → UNI-DATA360 → HEMIS
        (cần mã phiên ký số do UNI-DATA360/hệ thống ký số cấp).
      </p>
      <div className="flex gap-2">
        <button className={`btn ${entity === 'projects' ? 'btn-primary' : ''}`} onClick={() => setEntity('projects')}>
          Nhiệm vụ KHCN (đề tài)
        </button>
        <button className={`btn ${entity === 'publications' ? 'btn-primary' : ''}`} onClick={() => setEntity('publications')}>
          Bài báo / sách (đã xác nhận)
        </button>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && (
        <Card title={`${q.data.standard} — ${q.data.records.length} bản ghi`}>
          {q.data.records.length === 0 ? (
            <Empty>Chưa có dữ liệu.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {q.data.records.map((r) => (
                <li key={r.sourceCode} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{r.sourceCode}</span>
                    <span className="font-mono text-xs text-slate-500">{r.table}</span>
                    {r.missingRequired.length ? <StatusBadge status="REJECTED" label={`Thiếu bắt buộc: ${r.missingRequired.join(', ')}`} /> : <StatusBadge status="APPROVED" label="Đủ trường bắt buộc" />}
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => setOpen(open === r.sourceCode ? null : r.sourceCode)}>
                      {open === r.sourceCode ? 'Ẩn' : 'Xem bản ghi'}
                    </button>
                  </div>
                  {r.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-amber-800">
                      ⚠ {w}
                    </div>
                  ))}
                  {open === r.sourceCode && <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(r.record, null, 2)}</pre>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export function IntegrationCenterPage() {
  const q = useQuery({ queryKey: ['uni-status'], queryFn: () => api<Status>('/integrations/uni-data360/status') });
  const [tab, setTab] = useState<'sync' | 'hemis'>('sync');
  return (
    <>
      <PageHeader
        title="Integration Center"
        subtitle={
          <>
            UNI-DATA360 · <strong className="text-amber-700">GIẢ LẬP</strong> — {q.data?.contract ?? 'chưa có API thật'}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'sync', label: 'Đồng bộ UNI-DATA360' },
          { key: 'hemis', label: 'Xem trước chuẩn HEMIS' },
        ]}
      />
      {tab === 'sync' && (
        <>
          {q.isLoading && <Loading />}
          <ErrorBox error={q.error} />
          {q.data && <SyncTab s={q.data} />}
        </>
      )}
      {tab === 'hemis' && <HemisTab />}
    </>
  );
}
