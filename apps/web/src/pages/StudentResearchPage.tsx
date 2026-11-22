import { PROPOSAL_WORKFLOW, STUDENT_PRIZES, type StudentPrize } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, DownloadButton } from '../components/extras';
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface Group {
  key: string;
  proposals: number;
  submitted: number;
  approved: number;
  awarded: number;
}

interface Stats {
  years: number[];
  total: number;
  supervisorConfirmed: number;
  byUnit: Group[];
  byMajor: Group[];
  byCohort: Group[];
  byYear: Group[];
  prizes: Record<StudentPrize, number>;
  items: { id: string; code: string; title: string; ownerName: string; unitName: string; major: string | null; cohort: string | null; supervisorName: string | null; supervisorConfirmed: boolean; status: string; callId: string; prize: StudentPrize | null }[];
}

interface Ranking {
  call: { id: string; code: string; title: string; year: number };
  items: { proposalId: string; code: string; title: string; ownerName: string; unitName: string; major: string | null; cohort: string | null; supervisorName: string | null; status: string; councilCode: string | null; average: number | null; suggestion: string | null; prize: StudentPrize | null; prizeNote: string | null }[];
  canAward: boolean;
  note: string;
}

function GroupTable({ rows, label }: { rows: Group[]; label: string }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{label}</th>
          <th className="text-right">Đăng ký</th>
          <th className="text-right">Đã nộp</th>
          <th className="text-right">Được duyệt</th>
          <th className="text-right">Đạt giải</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="text-right">{r.proposals}</td>
            <td className="text-right">{r.submitted}</td>
            <td className="text-right">{r.approved}</td>
            <td className="text-right">{r.awarded}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RankingCard({ callId }: { callId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['student-ranking', callId], queryFn: () => api<Ranking>(`/student-research/calls/${callId}/ranking`) });
  const award = useMutation({
    mutationFn: (b: { proposalId: string; prize: StudentPrize }) => api('/student-research/awards', { method: 'PUT', body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-ranking'] }).then(() => qc.invalidateQueries({ queryKey: ['student-stats'] })),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  return (
    <Card title={`Xếp hạng, xếp giải — ${d.call.title}`}>
      {d.items.length === 0 ? (
        <Empty>Chưa có đề tài đã nộp trong đợt này.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Đề tài</th>
                <th>Khoa / ngành / khóa</th>
                <th>Hướng dẫn</th>
                <th className="text-right">Điểm HĐ</th>
                <th>Giải</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((x, i) => (
                <tr key={x.proposalId}>
                  <td>{i + 1}</td>
                  <td>
                    <Link className="link" to={`/proposals/${x.proposalId}`}>{x.code}</Link> — {x.title}
                    <div className="text-xs text-slate-500">{x.ownerName} · <StatusBadge wf="proposal" status={x.status} /></div>
                  </td>
                  <td className="text-xs">{x.unitName}<br />{x.major ?? '—'} · {x.cohort ?? '—'}</td>
                  <td className="text-xs">{x.supervisorName ?? '—'}</td>
                  <td className="text-right">{x.average ?? '—'}{x.councilCode && <div className="text-[11px] text-slate-500">{x.councilCode}</div>}</td>
                  <td>
                    {d.canAward ? (
                      <select className="input w-40 text-sm" aria-label={`Giải cho ${x.code}`} value={x.prize ?? ''} disabled={award.isPending} onChange={(e) => e.target.value && award.mutate({ proposalId: x.proposalId, prize: e.target.value as StudentPrize })}>
                        <option value="">— Chưa xếp —</option>
                        {Object.entries(STUDENT_PRIZES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : x.prize ? (
                      STUDENT_PRIZES[x.prize]
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ErrorBox error={award.error} />
      <p className="mt-2 text-xs text-slate-500">{d.note}</p>
    </Card>
  );
}

export function StudentResearchPage() {
  const { hasRole } = useSession();
  const [year, setYear] = useState('');
  const [tab, setTab] = useState<'stats' | 'list' | 'awards'>('stats');
  const q = useQuery({ queryKey: ['student-stats', year], queryFn: () => api<Stats>(`/student-research/stats${year ? `?year=${year}` : ''}`) });
  const calls = useQuery({ queryKey: ['calls'], queryFn: () => api<{ items: { id: string; title: string; level: string; year: number }[] }>('/calls') });
  const studentCalls = (calls.data?.items ?? []).filter((c) => c.level === 'STUDENT');
  const [callId, setCallId] = useState('');
  const managers = hasRole('SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR', 'UNIT_FOCAL', 'UNIT_HEAD');
  return (
    <>
      <PageHeader
        title="NCKH sinh viên"
        subtitle="Đăng ký đề tài có giảng viên hướng dẫn xác nhận, theo dõi tiến độ, hội đồng đánh giá, xếp giải, thống kê theo khoa / ngành / khóa."
        actions={
          <>
            <DownloadButton path="/exports/datasets/student" name="NCKH_sinh_vien.xlsx" label="⬇ Xuất Excel" />
            <Link className="btn btn-primary" to="/calls">Đăng ký đề tài mới</Link>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'stats', label: 'Thống kê' }, { key: 'list', label: 'Danh sách đề tài' }, ...(managers ? [{ key: 'awards' as const, label: 'Xếp giải' }] : [])]} />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : tab === 'stats' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Năm
              <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Tất cả</option>
                {q.data!.years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <span className="text-sm text-slate-600">Tổng: <strong>{q.data!.total}</strong> đề tài · đã có GV xác nhận hướng dẫn: <strong>{q.data!.supervisorConfirmed}</strong></span>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Theo khoa / đơn vị">
              <BarChart rows={q.data!.byUnit.map((r) => ({ k: r.key, v: r.proposals }))} label="k" value="v" title="Đề tài sinh viên theo khoa" />
              <GroupTable rows={q.data!.byUnit} label="Khoa / đơn vị" />
            </Card>
            <Card title="Cơ cấu giải">
              <BarChart rows={Object.entries(q.data!.prizes).map(([k, v]) => ({ k: STUDENT_PRIZES[k as StudentPrize], v }))} label="k" value="v" title="Cơ cấu giải" />
            </Card>
            <Card title="Theo ngành"><GroupTable rows={q.data!.byMajor} label="Ngành" /></Card>
            <Card title="Theo khóa"><GroupTable rows={q.data!.byCohort} label="Khóa" /></Card>
          </div>
        </div>
      ) : tab === 'list' ? (
        <div className="card overflow-x-auto">
          {q.data!.items.length === 0 ? (
            <Empty>Chưa có đề tài sinh viên.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên đề tài</th>
                  <th>Sinh viên</th>
                  <th>Người hướng dẫn</th>
                  <th>Trạng thái</th>
                  <th>Giải</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.items.map((x) => (
                  <tr key={x.id}>
                    <td className="font-mono text-xs"><Link className="link" to={`/proposals/${x.id}`}>{x.code}</Link></td>
                    <td>{x.title}<div className="text-xs text-slate-500">{x.unitName} · {x.major ?? '—'} · {x.cohort ?? '—'}</div></td>
                    <td>{x.ownerName}</td>
                    <td className="text-sm">{x.supervisorName ?? '—'} {x.supervisorName && (x.supervisorConfirmed ? <span className="text-emerald-700">✓</span> : <span className="text-amber-700">(chờ xác nhận)</span>)}</td>
                    <td><StatusBadge wf="proposal" status={x.status} label={PROPOSAL_WORKFLOW.states[x.status]?.label} /></td>
                    <td className="text-sm">{x.prize ? STUDENT_PRIZES[x.prize] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            Đợt NCKH sinh viên
            <select className="input w-auto" value={callId} onChange={(e) => setCallId(e.target.value)}>
              <option value="">— Chọn đợt —</option>
              {studentCalls.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          {callId ? <RankingCard callId={callId} /> : <Empty>Chọn đợt để xem bảng xếp hạng theo điểm hội đồng và ghi nhận giải.</Empty>}
        </div>
      )}
    </>
  );
}
