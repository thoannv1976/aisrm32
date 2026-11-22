import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ErrorBox, fmtDateTime, fmtVnd } from './ui';

export interface AiDraft {
  task: string;
  text: string;
  findings?: { severity: 'ERROR' | 'WARNING' | 'INFO'; source: 'RULE' | 'AI'; message: string }[];
  model: { provider: string; modelId: string; label: string };
  mock: boolean;
  usage: { inputTokens: number; outputTokens: number; costVnd: number | null; priceKnown: boolean };
  generatedAt: string;
  disclaimer: string;
  createdByName?: string;
  proposalVersion?: number;
}

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ enabled: boolean; mode: 'mock' | 'live'; isAdmin: boolean }>('/ai/status'), staleTime: 60_000 });
}

export function AiMeta({ d }: { d: AiDraft }) {
  return (
    <p className="mt-2 text-[11px] leading-snug text-slate-500">
      {d.mock ? 'Chế độ giả lập' : `${d.model.label}`} · {fmtDateTime(d.generatedAt)}
      {d.createdByName ? ` · ${d.createdByName}` : ''}
      {!d.mock && ` · ${d.usage.inputTokens}+${d.usage.outputTokens} token · ${d.usage.priceKnown ? fmtVnd(d.usage.costVnd) : 'chi phí chưa xác định'}`}
      <br />
      <em>{d.disclaimer}</em>
    </p>
  );
}

const SEV: Record<string, string> = { ERROR: 'text-red-800', WARNING: 'text-amber-800', INFO: 'text-slate-700' };
const SEV_ICON: Record<string, string> = { ERROR: '✕', WARNING: '⚠', INFO: 'ℹ' };

/** Trợ lý AI trên hồ sơ đề xuất: tóm tắt, kiểm tra thuyết minh. */
export function ProposalAiPanel({ id, version }: { id: string; version: number }) {
  const qc = useQueryClient();
  const status = useAiStatus();
  const q = useQuery({ queryKey: ['proposals', id, 'ai'], queryFn: () => api<{ latest: { summary: AiDraft | null; check: AiDraft | null; criteria?: (AiDraft & { comments?: { key: string; label: string; comment: string }[] }) | null } }>(`/proposals/${id}/ai`) });
  const run = useMutation({
    mutationFn: (task: 'summary' | 'check' | 'criteria') => api<AiDraft>(`/proposals/${id}/ai`, { method: 'POST', body: { task } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals', id, 'ai'] }),
  });
  const enabled = status.data?.enabled;
  const summary = q.data?.latest.summary;
  const check = q.data?.latest.check;
  const criteria = q.data?.latest.criteria;
  const stale = (d?: AiDraft | null) => d?.proposalVersion !== undefined && d.proposalVersion !== version;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn text-xs" disabled={!enabled || run.isPending} onClick={() => run.mutate('summary')}>
          ✨ Tóm tắt thuyết minh
        </button>
        <button className="btn text-xs" disabled={!enabled || run.isPending} onClick={() => run.mutate('check')}>
          ✨ Kiểm tra thuyết minh
        </button>
        <button className="btn text-xs" disabled={!enabled || run.isPending} onClick={() => run.mutate('criteria')} title="Gợi ý nhận xét sơ bộ theo từng tiêu chí của phiếu đánh giá — không chấm điểm">
          ✨ Gợi ý nhận xét theo tiêu chí
        </button>
      </div>
      {run.isPending && <p className="text-xs text-slate-500">AI đang xử lý…</p>}
      {!enabled && status.data && <p className="text-xs text-slate-500">AI chưa được bật cho trường (quản trị cấu hình tại AI Center).</p>}
      <ErrorBox error={run.error} />
      {summary && (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <div className="mb-1 text-xs font-semibold text-violet-900">Tóm tắt {stale(summary) && <span className="font-normal text-amber-700">(hồ sơ đã thay đổi sau lần tạo)</span>}</div>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{summary.text}</p>
          <AiMeta d={summary} />
        </div>
      )}
      {check && (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <div className="mb-1 text-xs font-semibold text-violet-900">Kiểm tra {stale(check) && <span className="font-normal text-amber-700">(hồ sơ đã thay đổi sau lần tạo)</span>}</div>
          <p className="text-sm text-slate-700">{check.text}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {check.findings?.map((f, i) => (
              <li key={i} className={SEV[f.severity]}>
                <span aria-hidden>{SEV_ICON[f.severity]}</span> <span className="rounded bg-white px-1 text-[10px] uppercase text-slate-500">{f.source === 'RULE' ? 'Quy tắc' : 'AI'}</span> {f.message}
              </li>
            ))}
          </ul>
          <AiMeta d={check} />
        </div>
      )}
      {criteria && (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <div className="mb-1 text-xs font-semibold text-violet-900">Nhận xét sơ bộ theo tiêu chí {stale(criteria) && <span className="font-normal text-amber-700">(hồ sơ đã thay đổi sau lần tạo)</span>}</div>
          <ul className="space-y-1 text-sm">
            {criteria.comments?.map((c) => (
              <li key={c.key}>
                <strong>{c.label}:</strong> {c.comment}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Chỉ là gợi ý để thành viên hội đồng tham khảo; điểm và kết luận do hội đồng quyết định.</p>
          <AiMeta d={criteria} />
        </div>
      )}
    </div>
  );
}
