import { PROJECT_WORKFLOW, type ChangeRequest, type DocumentMeta, type Milestone, type Project } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, fmtVnd, KeyValue, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { ActionBar, DocumentRow, HistoryList, Uploader, type ActionInfo } from '../components/workflow';
import { api, download } from '../lib/api';
import { useSession } from '../lib/session';

interface ProjectRow {
  id: string;
  code: string;
  title: string;
  status: string;
  ownerName: string;
  unitName: string;
  budgetVnd: number | null;
  startDate: string | null;
  endDate: string | null;
  milestoneStats: { total: number; accepted: number; nextDue: string | null };
  overdue: boolean;
}

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['projects', status], queryFn: () => api<{ items: ProjectRow[] }>(`/projects${status ? `?status=${status}` : ''}`) });
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (q.data?.items ?? []).filter((x) => !t || `${x.code} ${x.title} ${x.ownerName}`.toLowerCase().includes(t));
  }, [q.data, text]);
  return (
    <>
      <PageHeader
        title="Đề tài"
        subtitle="Đề tài đã được phê duyệt: giao nhiệm vụ, tiến độ, nghiệm thu"
        actions={
          <button className="btn" onClick={() => download('/dashboard/export.csv?dataset=projects', 'de-tai.csv')}>
            ⬇ Xuất CSV
          </button>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="label">
          Trạng thái
          <select className="input mt-1" value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
            <option value="">Tất cả</option>
            {Object.entries(PROJECT_WORKFLOW.states).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label grow">
          Tìm kiếm
          <input className="input mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mã, tên, chủ nhiệm…" />
        </label>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && (
        <div className="card overflow-x-auto">
          {items.length === 0 ? (
            <Empty>Chưa có đề tài.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên đề tài</th>
                  <th>Chủ nhiệm</th>
                  <th>Thời gian</th>
                  <th>Tiến độ mốc</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap">
                      <Link className="link" to={`/projects/${x.id}`}>
                        {x.code}
                      </Link>
                    </td>
                    <td className="min-w-64">
                      {x.title}
                      <div className="text-xs text-slate-500">{x.unitName}</div>
                    </td>
                    <td>{x.ownerName}</td>
                    <td className="whitespace-nowrap text-slate-600">
                      {fmtDate(x.startDate)} – {fmtDate(x.endDate)}
                    </td>
                    <td className="whitespace-nowrap">
                      {x.milestoneStats.accepted}/{x.milestoneStats.total}
                      {x.overdue && <StatusBadge status="OVERDUE" label="Có mốc quá hạn" />}
                    </td>
                    <td>
                      <StatusBadge wf="project" status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

type MilestoneRow = Milestone & { overdue: boolean };
interface ProjectDetail {
  item: Project & { pendingChangeRequests?: number };
  actions: ActionInfo[];
  milestones: MilestoneRow[];
  changeRequests: ChangeRequest[];
  documents: DocumentMeta[];
  permissions: { isOffice: boolean; isTeam: boolean; isOwner: boolean };
}

const CR_TYPE: Record<ChangeRequest['type'], string> = { EXTENSION: 'Gia hạn', MEMBER: 'Thay đổi thành viên', BUDGET: 'Điều chỉnh dự toán', OTHER: 'Khác' };
const MS_STATUS: Record<Milestone['status'], [string, string]> = { OPEN: ['DRAFT', 'Chưa nộp'], SUBMITTED: ['ACTIVE', 'Đã nộp, chờ duyệt'], ACCEPTED: ['APPROVED', 'Đã chấp nhận'] };

function useProjectMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api(`/projects/${id}${path}`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

function MilestonesCard({ d, id }: { d: ProjectDetail; id: string }) {
  const p = d.item;
  const m = useProjectMutation(id);
  const { me } = useSession();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', dueDate: '', deliverable: '' });
  const canAdd = (d.permissions.isOwner || d.permissions.isOffice) && ['CONTRACT_PENDING', 'ACTIVE'].includes(p.status);
  const canSubmit = d.permissions.isTeam && ['ACTIVE', 'COMPLETION_REVISION'].includes(p.status);
  const docsFor = (mid: string) => d.documents.filter((x) => x.milestoneId === mid);

  return (
    <Card
      title={`Mốc tiến độ và sản phẩm (${p.milestoneStats.accepted}/${p.milestoneStats.total} đã chấp nhận)`}
      actions={
        canAdd && (
          <button className="btn text-xs" onClick={() => setAdding(true)}>
            + Thêm mốc
          </button>
        )
      }
    >
      <ErrorBox error={m.error} />
      {d.milestones.length === 0 ? (
        <Empty>Chưa thiết lập mốc. Cần ít nhất một mốc trước khi giao nhiệm vụ.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {d.milestones.map((ms) => (
            <li key={ms.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{ms.title}</div>
                  <div className="text-sm text-slate-600">Sản phẩm: {ms.deliverable || '—'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    Hạn: {fmtDate(ms.dueDate)}
                    <StatusBadge status={MS_STATUS[ms.status][0]} label={MS_STATUS[ms.status][1]} />
                    {ms.overdue && <StatusBadge status="OVERDUE" label="Quá hạn" />}
                    {ms.submittedAt && <span>Nộp: {fmtDateTime(ms.submittedAt)}</span>}
                  </div>
                  {ms.submittedNote && <p className="mt-1 rounded bg-slate-50 p-2 text-sm">{ms.submittedNote}</p>}
                  <ul className="ml-2">
                    {docsFor(ms.id).map((x) => (
                      <DocumentRow key={x.id} d={x} canRevoke={ms.status === 'OPEN' && x.uploadedBy === me?.uid} />
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canSubmit && ms.status === 'OPEN' && (
                    <>
                      <Uploader parentType="project" parentId={id} milestoneId={ms.id} label="Tải sản phẩm" />
                      <button
                        className="btn btn-primary text-xs"
                        disabled={m.isPending}
                        onClick={() => {
                          const note = prompt('Ghi chú khi nộp sản phẩm (bắt buộc nếu không có tệp):', '');
                          if (note !== null) m.mutate({ path: `/milestones/${ms.id}/submit`, body: { note } });
                        }}
                      >
                        Nộp sản phẩm
                      </button>
                    </>
                  )}
                  {d.permissions.isOffice && ms.status === 'SUBMITTED' && (
                    <>
                      <button className="btn btn-primary text-xs" disabled={m.isPending} onClick={() => m.mutate({ path: `/milestones/${ms.id}/accept`, body: {} })}>
                        Chấp nhận
                      </button>
                      <button
                        className="btn text-xs"
                        disabled={m.isPending}
                        onClick={() => {
                          const note = prompt('Lý do trả lại sản phẩm:');
                          if (note?.trim()) m.mutate({ path: `/milestones/${ms.id}/return`, body: { note } });
                        }}
                      >
                        Trả lại
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} title="Thêm mốc tiến độ" onClose={() => setAdding(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({ path: '/milestones', body: form }, { onSuccess: () => (setAdding(false), setForm({ title: '', dueDate: '', deliverable: '' })) });
          }}
        >
          <Field label="Tên mốc" required>
            <input className="input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} />
          </Field>
          <Field label="Hạn hoàn thành" required>
            <input className="input mt-1" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required max={p.endDate ?? undefined} />
          </Field>
          <Field label="Sản phẩm cần nộp">
            <textarea className="input mt-1" rows={2} value={form.deliverable} onChange={(e) => setForm({ ...form, deliverable: e.target.value })} />
          </Field>
          <ErrorBox error={m.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={m.isPending}>
              Thêm
            </button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function ChangeRequestsCard({ d, id }: { d: ProjectDetail; id: string }) {
  const m = useProjectMutation(id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'EXTENSION' as ChangeRequest['type'], reason: '', proposedEndDate: '' });
  const canRequest = d.permissions.isOwner && ['ACTIVE', 'SUSPENDED'].includes(d.item.status);
  return (
    <Card
      title="Yêu cầu thay đổi / gia hạn"
      actions={
        canRequest && (
          <button className="btn text-xs" onClick={() => setOpen(true)}>
            + Gửi yêu cầu
          </button>
        )
      }
    >
      <ErrorBox error={m.error} />
      {d.changeRequests.length === 0 ? (
        <Empty>Chưa có yêu cầu thay đổi.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {d.changeRequests.map((c) => (
            <li key={c.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{CR_TYPE[c.type]}</strong>
                  {c.proposedEndDate && <span> → kết thúc mới {fmtDate(c.proposedEndDate)}</span>}
                  <span className="text-slate-500">
                    {' '}
                    · {c.requestedByName} · {fmtDateTime(c.requestedAt)}
                  </span>
                </div>
                <StatusBadge status={c.status === 'PENDING' ? 'SCIENCE_REVIEW' : c.status} label={c.status === 'PENDING' ? 'Chờ xử lý' : c.status === 'APPROVED' ? 'Chấp thuận' : 'Không chấp thuận'} />
              </div>
              <p className="mt-1 text-slate-700">{c.reason}</p>
              {c.decisionNote && <p className="mt-1 rounded bg-slate-50 p-2 text-slate-700">Ý kiến: {c.decisionNote}</p>}
              {c.status === 'PENDING' && d.permissions.isOffice && (
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-primary text-xs" onClick={() => m.mutate({ path: `/change-requests/${c.id}/decide`, body: { decision: 'APPROVED', note: prompt('Ý kiến (không bắt buộc):') ?? '' } })}>
                    Chấp thuận
                  </button>
                  <button
                    className="btn btn-danger text-xs"
                    onClick={() => {
                      const note = prompt('Lý do không chấp thuận:');
                      if (note?.trim()) m.mutate({ path: `/change-requests/${c.id}/decide`, body: { decision: 'REJECTED', note } });
                    }}
                  >
                    Không chấp thuận
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} title="Gửi yêu cầu thay đổi" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(
              { path: '/change-requests', body: { type: form.type, reason: form.reason, proposedEndDate: form.type === 'EXTENSION' ? form.proposedEndDate : null } },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <Field label="Loại yêu cầu" required>
            <select className="input mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChangeRequest['type'] })}>
              {Object.entries(CR_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {form.type === 'EXTENSION' && (
            <Field label="Ngày kết thúc mới" required>
              <input className="input mt-1" type="date" required min={d.item.endDate ?? undefined} value={form.proposedEndDate} onChange={(e) => setForm({ ...form, proposedEndDate: e.target.value })} />
            </Field>
          )}
          <Field label="Lý do" required>
            <textarea className="input mt-1" rows={4} required minLength={5} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <ErrorBox error={m.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={m.isPending}>
              Gửi
            </button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function ScheduleForm({ d, id }: { d: ProjectDetail; id: string }) {
  const m = useProjectMutation(id);
  const [s, setS] = useState({ startDate: d.item.startDate ?? '', endDate: d.item.endDate ?? '' });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ path: '/schedule', body: { ...s, expectedVersion: d.item.version } });
      }}
    >
      <label className="label">
        Bắt đầu
        <input className="input mt-1" type="date" required value={s.startDate} onChange={(e) => setS({ ...s, startDate: e.target.value })} />
      </label>
      <label className="label">
        Kết thúc
        <input className="input mt-1" type="date" required value={s.endDate} onChange={(e) => setS({ ...s, endDate: e.target.value })} />
      </label>
      <button className="btn" disabled={m.isPending}>
        Cập nhật thời gian
      </button>
      <ErrorBox error={m.error} />
    </form>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams() as { id: string };
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const q = useQuery({ queryKey: ['projects', id], queryFn: () => api<ProjectDetail>(`/projects/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const p = d.item;
  return (
    <>
      <PageHeader
        back={<Link to="/projects" className="link">← Đề tài</Link>}
        title={p.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.code}</span>
            <StatusBadge wf="project" status={p.status} />
            <span>· Chủ nhiệm: {p.ownerName} · {p.unitName}</span>
          </span>
        }
        actions={<ActionBar kind="projects" id={id} version={p.version} actions={d.actions} />}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Tổng quan & tiến độ' },
          { key: 'history', label: 'Lịch sử xử lý' },
        ]}
      />
      {tab === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            <MilestonesCard d={d} id={id} />
            <ChangeRequestsCard d={d} id={id} />
          </div>
          <aside className="space-y-4">
            <Card title="Thông tin đề tài">
              <KeyValue
                items={[
                  ['Kinh phí được duyệt', fmtVnd(p.budgetVnd)],
                  ['Bắt đầu', fmtDate(p.startDate)],
                  ['Kết thúc', fmtDate(p.endDate)],
                  ['Mốc tiếp theo', fmtDate(p.milestoneStats.nextDue)],
                  ['Hồ sơ đề xuất', <Link className="link" to={`/proposals/${p.proposalId}`}>Xem đề xuất</Link>],
                ]}
              />
              {d.permissions.isOffice && p.status === 'CONTRACT_PENDING' && (
                <div className="mt-4 border-t pt-3">
                  <ScheduleForm d={d} id={id} />
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">Trạng thái giải ngân/quyết toán sẽ được nhận từ hệ thống tài chính (phân hệ Kinh phí — P1); không suy ra từ việc phê duyệt.</p>
            </Card>
            <Card title="Thành viên">
              <ul className="space-y-1 text-sm">
                {p.members.map((m, i) => (
                  <li key={i}>
                    {m.uid ? (
                      <Link className="link" to={`/researchers/${m.uid}`}>
                        {m.name}
                      </Link>
                    ) : (
                      m.name
                    )}{' '}
                    <span className="text-slate-500">— {m.role === 'PI' ? 'Chủ nhiệm' : 'Thành viên'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      ) : (
        <Card title="Lịch sử xử lý">
          <HistoryList kind="projects" id={id} wf="project" />
        </Card>
      )}
    </>
  );
}
