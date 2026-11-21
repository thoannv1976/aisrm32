import type { DocumentMeta, WorkflowHistoryEntry } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, download, errorMessage, newIdempotencyKey } from '../lib/api';
import { Empty, ErrorBox, fmtDateTime, Loading, Modal, StatusBadge } from './ui';

export interface ActionInfo {
  action: string;
  label: string;
  requireComment: boolean;
  tone: string;
}

/**
 * Thanh thao tác workflow: chỉ hiển thị các thao tác server trả về là được phép.
 * Gửi kèm expectedVersion (chống duyệt đồng thời) và Idempotency-Key (chống bấm hai lần).
 */
export function ActionBar({
  kind,
  id,
  version,
  actions,
  onDone,
}: {
  kind: 'proposals' | 'projects' | 'publications';
  id: string;
  version: number;
  actions: ActionInfo[];
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ActionInfo | null>(null);
  const [comment, setComment] = useState('');
  const idemKey = useRef(newIdempotencyKey());

  const m = useMutation({
    mutationFn: (a: { action: string; comment?: string }) =>
      api(`/${kind}/${id}/transitions`, {
        method: 'POST',
        body: { action: a.action, expectedVersion: version, comment: a.comment || null },
        headers: { 'Idempotency-Key': idemKey.current },
      }),
    onSuccess: async () => {
      idemKey.current = newIdempotencyKey();
      setPending(null);
      setComment('');
      await qc.invalidateQueries();
      onDone?.();
    },
    onError: () => {
      idemKey.current = newIdempotencyKey();
    },
  });

  if (actions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.action}
            className={`btn ${a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : ''}`}
            disabled={m.isPending}
            onClick={() => {
              m.reset();
              setComment('');
              setPending(a);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <Modal open={!!pending} title={pending?.label ?? ''} onClose={() => setPending(null)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) m.mutate({ action: pending.action, comment });
          }}
          className="space-y-3"
        >
          <label className="label">
            Ý kiến / lý do {pending?.requireComment ? <span className="text-red-600">*</span> : <span className="font-normal text-slate-500">(không bắt buộc)</span>}
            <textarea
              className="input mt-1"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required={pending?.requireComment}
              maxLength={4000}
              autoFocus
            />
          </label>
          <p className="text-xs text-slate-500">Thao tác được ghi vào lịch sử hồ sơ với tên, thời gian và nội dung ý kiến của bạn. Đây là phê duyệt điện tử, không phải chữ ký số.</p>
          {m.error && <ErrorBox error={m.error} />}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Hủy
            </button>
            <button type="submit" className={`btn ${pending?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={m.isPending}>
              {m.isPending ? 'Đang xử lý…' : `Xác nhận: ${pending?.label}`}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function HistoryList({ kind, id, wf }: { kind: 'proposals' | 'projects' | 'publications'; id: string; wf: 'proposal' | 'project' | 'publication' }) {
  const q = useQuery({ queryKey: [kind, id, 'history'], queryFn: () => api<{ items: WorkflowHistoryEntry[] }>(`/${kind}/${id}/history`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.items.length) return <Empty>Chưa có lịch sử xử lý.</Empty>;
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {q.data.items.map((h) => (
        <li key={h.id} className="mb-4 ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{h.actionLabel}</span>
            <StatusBadge wf={wf} status={h.from} />
            <span aria-hidden>→</span>
            <StatusBadge wf={wf} status={h.to} />
            {h.revisionNo ? <span className="text-xs text-slate-500">Bản nộp #{h.revisionNo}</span> : null}
          </div>
          <div className="text-xs text-slate-500">
            {h.actorName} · {fmtDateTime(h.at)}
          </div>
          {h.comment && <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm text-slate-700">{h.comment}</p>}
        </li>
      ))}
    </ol>
  );
}

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function DocumentRow({ d, canRevoke }: { d: DocumentMeta; canRevoke: boolean }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<unknown>(null);
  const revoke = useMutation({
    mutationFn: () => api(`/documents/${d.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries(),
    onError: setErr,
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <button className="link truncate text-left" onClick={() => download(`/documents/${d.id}/download`, d.fileName).catch(setErr)}>
          {d.fileName}
        </button>
        <div className="text-xs text-slate-500">
          {fmtSize(d.size)} · {d.uploadedByName} · {fmtDateTime(d.uploadedAt)}
        </div>
        {err ? <div className="text-xs text-red-700">{errorMessage(err)}</div> : null}
      </div>
      {canRevoke && (
        <button className="btn btn-danger text-xs" disabled={revoke.isPending} onClick={() => confirm(`Thu hồi tệp "${d.fileName}"?`) && revoke.mutate()}>
          Thu hồi
        </button>
      )}
    </li>
  );
}

export function Uploader({
  parentType,
  parentId,
  checklistKey,
  milestoneId,
  label = 'Tải tệp lên',
}: {
  parentType: 'proposal' | 'project' | 'publication';
  parentId: string;
  checklistKey?: string;
  milestoneId?: string;
  label?: string;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const m = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set('parentType', parentType);
      fd.set('parentId', parentId);
      if (checklistKey) fd.set('checklistKey', checklistKey);
      if (milestoneId) fd.set('milestoneId', milestoneId);
      fd.set('file', file);
      return api('/documents', { method: 'POST', body: fd });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) m.mutate(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="btn text-xs" disabled={m.isPending} onClick={() => input.current?.click()}>
        {m.isPending ? 'Đang tải…' : `⬆ ${label}`}
      </button>
      {m.error && <span className="text-xs text-red-700">{errorMessage(m.error)}</span>}
    </div>
  );
}
