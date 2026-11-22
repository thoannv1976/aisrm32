import {
  COUNCIL_ROLE_LABELS,
  COUNCIL_STATUS_LABELS,
  COUNCIL_TYPE_LABELS,
  rubricMax,
  type CouncilMember,
  type CouncilRole,
  type CouncilStatus,
  type CouncilTarget,
  type CouncilType,
  type ReviewSheet,
  type Rubric,
  type TargetResult,
} from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AiMeta, useAiStatus, type AiDraft } from '../components/ai';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { DownloadButton } from '../components/extras';

const STATUS_TONE: Record<CouncilStatus, string> = { SETUP: 'DRAFT', SCORING: 'ACTIVE', SCORING_CLOSED: 'APPROVAL_PENDING', MINUTES_CONFIRMED: 'APPROVED' };
const CouncilBadge = ({ s }: { s: CouncilStatus }) => <StatusBadge status={STATUS_TONE[s]} label={COUNCIL_STATUS_LABELS[s]} />;

interface CouncilRow {
  id: string;
  code: string;
  title: string;
  type: CouncilType;
  status: CouncilStatus;
  targets: number;
  members: number;
  myRole: CouncilRole | null;
  myStatus: string | null;
  scoringDeadline: string | null;
}

function CreateCouncil({ rubrics, onClose }: { rubrics: Rubric[]; onClose: () => void }) {
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', type: 'PROPOSAL_REVIEW' as CouncilType, rubricTemplateKey: 'proposal_review', scoringDeadline: '' });
  const [picked, setPicked] = useState<{ type: 'proposal' | 'project'; id: string }[]>([]);
  const proposals = useQuery({ queryKey: ['proposals', 'for-council'], queryFn: () => api<{ items: { id: string; code: string; title: string; status: string; callCode: string }[] }>('/proposals?status=UNIT_REVIEW,SCIENCE_REVIEW,EXPERT_REVIEW,APPROVAL_PENDING') });
  const projects = useQuery({ queryKey: ['projects', 'for-council'], queryFn: () => api<{ items: { id: string; code: string; title: string; status: string }[] }>('/projects?status=ACTIVE,ACCEPTANCE_REQUESTED,ACCEPTANCE_REVIEW') });
  const m = useMutation({
    mutationFn: () => api<{ id: string }>('/councils', { method: 'POST', body: { ...f, scoringDeadline: f.scoringDeadline || null, targets: picked } }),
    onSuccess: (r) => nav(`/councils/${r.id}`),
  });
  const toggle = (type: 'proposal' | 'project', id: string) =>
    setPicked((x) => (x.some((y) => y.id === id) ? x.filter((y) => y.id !== id) : [...x, { type, id }]));
  const list = f.type === 'ACCEPTANCE' ? (projects.data?.items ?? []).map((x) => ({ ...x, kind: 'project' as const })) : (proposals.data?.items ?? []).map((x) => ({ ...x, kind: 'proposal' as const }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Field label="Tên hội đồng" required>
        <input className="input mt-1" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loại" required>
          <select
            className="input mt-1"
            value={f.type}
            onChange={(e) => {
              const type = e.target.value as CouncilType;
              setPicked([]);
              setF({ ...f, type, rubricTemplateKey: type === 'ACCEPTANCE' ? 'acceptance' : type === 'STUDENT_AWARD' ? 'student_award' : 'proposal_review' });
            }}
          >
            {Object.entries(COUNCIL_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phiếu chấm" required>
          <select className="input mt-1" value={f.rubricTemplateKey} onChange={(e) => setF({ ...f, rubricTemplateKey: e.target.value })}>
            {rubrics.map((r) => (
              <option key={r.templateKey} value={r.templateKey}>
                {r.name} (v{r.version}, {rubricMax(r)} điểm)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hạn chấm">
          <input className="input mt-1" type="date" value={f.scoringDeadline} onChange={(e) => setF({ ...f, scoringDeadline: e.target.value })} />
        </Field>
      </div>
      <fieldset>
        <legend className="label">Hồ sơ đưa ra hội đồng ({picked.length})</legend>
        <ul className="max-h-60 overflow-y-auto rounded-md border border-slate-200 text-sm">
          {list.length === 0 && <li className="p-3 text-slate-500">Không có hồ sơ phù hợp.</li>}
          {list.map((x) => (
            <li key={x.id} className="border-b border-slate-100 last:border-0">
              <label className="flex items-start gap-2 p-2">
                <input type="checkbox" checked={picked.some((y) => y.id === x.id)} onChange={() => toggle(x.kind, x.id)} />
                <span>
                  <span className="font-mono text-xs">{x.code}</span> {x.title}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <ErrorBox error={m.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Hủy
        </button>
        <button className="btn btn-primary" disabled={!picked.length || m.isPending}>
          Thành lập
        </button>
      </div>
    </form>
  );
}

export function CouncilsPage() {
  const q = useQuery({ queryKey: ['councils'], queryFn: () => api<{ items: CouncilRow[]; canManage: boolean; rubrics: Rubric[] }>('/councils') });
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Hội đồng và phản biện"
        subtitle="Hội đồng xét duyệt, nghiệm thu, đánh giá NCKH sinh viên — chấm điểm độc lập theo phiếu"
        actions={
          q.data?.canManage && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              + Thành lập hội đồng
            </button>
          )
        }
      />
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && (
        <div className="card overflow-x-auto">
          {q.data.items.length === 0 ? (
            <Empty>{q.data.canManage ? 'Chưa có hội đồng.' : 'Bạn chưa được mời vào hội đồng nào.'}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Hội đồng</th>
                  <th>Loại</th>
                  <th>Hồ sơ</th>
                  <th>Vai trò của tôi</th>
                  <th>Hạn chấm</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">
                      <Link className="link" to={`/councils/${c.id}`}>
                        {c.code}
                      </Link>
                    </td>
                    <td>{c.title}</td>
                    <td className="whitespace-nowrap">{COUNCIL_TYPE_LABELS[c.type]}</td>
                    <td>{c.targets}</td>
                    <td>
                      {c.myRole ? COUNCIL_ROLE_LABELS[c.myRole] : '—'}
                      {c.myStatus === 'INVITED' && <span className="ml-1 text-xs text-amber-700">(chờ xác nhận)</span>}
                    </td>
                    <td>{fmtDate(c.scoringDeadline)}</td>
                    <td>
                      <CouncilBadge s={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <Modal open={open} title="Thành lập hội đồng" onClose={() => setOpen(false)}>
        {q.data && <CreateCouncil rubrics={q.data.rubrics} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

interface CouncilFull {
  id: string;
  code: string;
  title: string;
  type: CouncilType;
  rubric: Rubric;
  targets: CouncilTarget[];
  members: CouncilMember[];
  status: CouncilStatus;
  scoringDeadline: string | null;
  results: TargetResult[] | null;
  minutes: { text: string; updatedAt: string; updatedByName: string } | null;
  conclusions: Record<string, { decision: 'APPROVE' | 'REVISE' | 'REJECT'; note: string }> | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
}
interface Detail {
  item: CouncilFull;
  me: CouncilMember | null;
  permissions: { manage: boolean; chair: boolean; secretary: boolean; canScore: boolean };
  progress: { targetId: string; eligible: number; submitted: number }[];
  mySheets: ReviewSheet[];
  allSheets: ReviewSheet[] | null;
  maxTotal: number;
  typeLabel: string;
}

function useCouncilMutation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method = 'POST', path, body }: { method?: string; path: string; body?: unknown }) => api(`/councils/${id}${path}`, { method, body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

function ScoreForm({ d, target }: { d: Detail; target: CouncilTarget }) {
  const sheet = d.mySheets.find((s) => s.targetId === target.id);
  const [scores, setScores] = useState<Record<string, number | ''>>(() => Object.fromEntries(d.item.rubric.criteria.map((c) => [c.key, sheet?.scores[c.key] ?? ''])));
  const [comment, setComment] = useState(sheet?.comment ?? '');
  const m = useCouncilMutation(d.item.id);
  const total = d.item.rubric.criteria.reduce((s, c) => s + (Number(scores[c.key]) || 0), 0);
  if (sheet?.status === 'SUBMITTED') {
    return (
      <div className="rounded-md bg-emerald-50 p-3 text-sm">
        <div className="font-medium text-emerald-900">✓ Đã nộp phiếu lúc {fmtDateTime(sheet.submittedAt)} — tổng {sheet.total}/{d.maxTotal} điểm (đã khóa)</div>
        <ul className="mt-1 text-slate-700">
          {d.item.rubric.criteria.map((c) => (
            <li key={c.key}>
              {c.label}: <strong>{sheet.scores[c.key]}</strong>/{c.maxScore}
            </li>
          ))}
        </ul>
        {sheet.comment && <p className="mt-1 whitespace-pre-wrap">Nhận xét: {sheet.comment}</p>}
      </div>
    );
  }
  const body = (submit: boolean) => ({ scores: Object.fromEntries(Object.entries(scores).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])), comment, submit });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm(`Nộp phiếu ${total}/${d.maxTotal} điểm? Phiếu đã nộp không sửa được.`)) m.mutate({ method: 'PUT', path: `/sheets/${target.id}`, body: body(true) });
      }}
    >
      <table className="table">
        <tbody>
          {d.item.rubric.criteria.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td className="w-32">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={c.maxScore}
                  step={0.5}
                  required
                  aria-label={c.label}
                  value={scores[c.key]}
                  onChange={(e) => setScores({ ...scores, [c.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </td>
              <td className="w-16 text-slate-500">/ {c.maxScore}</td>
            </tr>
          ))}
          <tr>
            <td className="font-semibold">Tổng</td>
            <td className="font-semibold tabular-nums">{total}</td>
            <td className="text-slate-500">/ {d.maxTotal}</td>
          </tr>
        </tbody>
      </table>
      <label className="label">
        Nhận xét
        <textarea className="input mt-1" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} />
      </label>
      <ErrorBox error={m.error} />
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={m.isPending} onClick={() => m.mutate({ method: 'PUT', path: `/sheets/${target.id}`, body: body(false) })}>
          Lưu nháp
        </button>
        <button className="btn btn-primary" disabled={m.isPending}>
          Nộp phiếu
        </button>
        {sheet?.status === 'DRAFT' && <span className="self-center text-xs text-slate-500">Nháp lưu lúc {fmtDateTime(sheet.updatedAt)}</span>}
      </div>
    </form>
  );
}

function CoiBox({ d, target }: { d: Detail; target: CouncilTarget }) {
  const m = useCouncilMutation(d.item.id);
  const [note, setNote] = useState('');
  const coi = d.me?.coi[target.id];
  if (coi) {
    return coi.hasConflict ? (
      <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">⚠ Đã khai báo xung đột lợi ích ({coi.note}). Bạn không xem và không chấm hồ sơ này.</p>
    ) : (
      <p className="text-xs text-emerald-700">✓ Đã khai báo không có xung đột lợi ích ({fmtDateTime(coi.declaredAt)}).</p>
    );
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="mb-2 font-medium text-amber-900">Khai báo xung đột lợi ích trước khi xem hồ sơ</p>
      <p className="mb-2 text-xs text-amber-900">Quan hệ gia đình, đồng tác giả gần đây, cùng nhóm nghiên cứu, lợi ích tài chính… với chủ nhiệm/thành viên đề tài.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary text-xs" disabled={m.isPending} onClick={() => m.mutate({ path: '/coi', body: { targetId: target.id, hasConflict: false } })}>
          Tôi không có xung đột lợi ích
        </button>
        <input className="input max-w-xs text-xs" placeholder="Mô tả xung đột (nếu có)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-danger text-xs" disabled={m.isPending || !note.trim()} onClick={() => m.mutate({ path: '/coi', body: { targetId: target.id, hasConflict: true, note } })}>
          Có xung đột — không chấm
        </button>
      </div>
      <ErrorBox error={m.error} />
    </div>
  );
}

function TargetsTab({ d }: { d: Detail }) {
  return (
    <div className="space-y-4">
      {d.item.targets.map((t) => {
        const pr = d.progress.find((x) => x.targetId === t.id);
        const coi = d.me?.coi[t.id];
        const canView = d.permissions.manage || (coi && !coi.hasConflict);
        return (
          <Card
            key={t.id}
            title={
              <span>
                <span className="font-mono text-xs">{t.code}</span> {t.title}
              </span>
            }
            actions={
              <span className="text-xs text-slate-500">
                {pr?.submitted ?? 0}/{pr?.eligible ?? 0} phiếu đã nộp
              </span>
            }
          >
            <p className="mb-2 text-sm text-slate-600">
              Chủ nhiệm: {t.ownerName} · {t.unitName}{' '}
              {canView && (
                <Link className="link ml-2" to={`/${t.type === 'proposal' ? 'proposals' : 'projects'}/${t.id}`} target="_blank">
                  Mở hồ sơ ↗
                </Link>
              )}
            </p>
            {d.me?.status === 'ACCEPTED' && d.item.status === 'SCORING' && <CoiBox d={d} target={t} />}
            {d.permissions.canScore && coi && !coi.hasConflict && (
              <div className="mt-3">
                <ScoreForm d={d} target={t} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

interface Candidate {
  uid: string;
  name: string;
  title: string | null;
  unitName: string | null;
  score: number;
  matched: string[];
  expertise: string[];
  conflicts: { level: 'BLOCK' | 'WARN'; reason: string }[];
}

function MembersTab({ d }: { d: Detail }) {
  const m = useCouncilMutation(d.item.id);
  const [target, setTarget] = useState(d.item.targets[0]?.id ?? '');
  const [role, setRole] = useState<CouncilRole>('REVIEWER');
  const [q, setQ] = useState('');
  const t = d.item.targets.find((x) => x.id === target);
  const sug = useQuery({
    queryKey: ['suggest', target],
    queryFn: () => api<{ items: Candidate[]; method: string }>(`/councils/suggest-reviewers?type=${t!.type}&id=${t!.id}`),
    enabled: d.permissions.manage && !!t && d.item.status !== 'MINUTES_CONFIRMED',
  });
  const people = useQuery({ queryKey: ['people', q], queryFn: () => api<{ items: { uid: string; displayName: string; unitName: string | null }[] }>(`/people?q=${encodeURIComponent(q)}`), enabled: q.trim().length >= 2 });
  const inCouncil = new Set(d.item.members.map((x) => x.uid));
  const canAdd = d.permissions.manage && ['SETUP', 'SCORING'].includes(d.item.status);
  return (
    <div className="space-y-5">
      <Card title={`Thành viên (${d.item.members.length})`}>
        {d.item.members.length === 0 ? (
          <Empty>Chưa có thành viên.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Vai trò</th>
                  <th>Xác nhận</th>
                  <th>Khai báo xung đột lợi ích</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.item.members.map((x) => (
                  <tr key={x.uid}>
                    <td>
                      {x.name}
                      <div className="text-xs text-slate-500">{x.unitName}</div>
                    </td>
                    <td>{COUNCIL_ROLE_LABELS[x.role]}</td>
                    <td>
                      <StatusBadge status={x.status === 'ACCEPTED' ? 'APPROVED' : x.status === 'DECLINED' ? 'REJECTED' : 'DRAFT'} label={x.status === 'ACCEPTED' ? 'Nhận lời' : x.status === 'DECLINED' ? 'Từ chối' : 'Chờ xác nhận'} />
                    </td>
                    <td className="text-xs">
                      {d.item.targets.map((tg) => {
                        const c = x.coi[tg.id];
                        return (
                          <div key={tg.id}>
                            {tg.code}: {c ? (c.hasConflict ? <span className="text-amber-800">có xung đột{c.note ? ` — ${c.note}` : ''}</span> : <span className="text-emerald-700">không</span>) : <span className="text-slate-400">chưa khai báo</span>}
                          </div>
                        );
                      })}
                    </td>
                    <td>
                      {d.permissions.manage && d.item.status === 'SETUP' && (
                        <button className="text-xs text-red-700 hover:underline" onClick={() => confirm(`Bỏ ${x.name} khỏi hội đồng?`) && m.mutate({ method: 'DELETE', path: `/members/${x.uid}` })}>
                          Bỏ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={m.error} />
      </Card>
      {canAdd && (
        <Card title="Mời thành viên — gợi ý phản biện theo chuyên môn">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="label">
              Gợi ý cho hồ sơ
              <select className="input mt-1" value={target} onChange={(e) => setTarget(e.target.value)}>
                {d.item.targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} — {x.title.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Vai trò khi mời
              <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as CouncilRole)}>
                {Object.entries(COUNCIL_ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sug.isLoading && <Loading />}
          {sug.data && (
            <>
              <p className="mb-2 text-xs text-slate-500">{sug.data.method}</p>
              <ul className="divide-y divide-slate-100">
                {sug.data.items.map((c) => {
                  const blocked = c.conflicts.some((x) => x.level === 'BLOCK');
                  return (
                    <li key={c.uid} className="flex flex-wrap items-start justify-between gap-2 py-2">
                      <div className="min-w-0 text-sm">
                        <div className="font-medium">
                          {c.name} <span className="text-xs font-normal text-slate-500">· {c.unitName} · điểm phù hợp {c.score}</span>
                        </div>
                        <div className="text-xs text-slate-600">Khớp: {c.matched.join(', ')}</div>
                        {c.conflicts.map((x, i) => (
                          <div key={i} className={`text-xs ${x.level === 'BLOCK' ? 'text-red-700' : 'text-amber-800'}`}>
                            {x.level === 'BLOCK' ? '⛔' : '⚠'} {x.reason}
                          </div>
                        ))}
                      </div>
                      <button className="btn text-xs" disabled={blocked || inCouncil.has(c.uid) || m.isPending} onClick={() => m.mutate({ path: '/members', body: { uid: c.uid, role } })}>
                        {inCouncil.has(c.uid) ? 'Đã mời' : `Mời làm ${COUNCIL_ROLE_LABELS[role].toLowerCase()}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="mt-4 border-t pt-3">
            <label className="label">
              Hoặc tìm theo tên
              <input className="input mt-1 max-w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ ít nhất 2 ký tự" />
            </label>
            <ul className="mt-1 text-sm">
              {people.data?.items
                .filter((x) => !inCouncil.has(x.uid))
                .map((x) => (
                  <li key={x.uid} className="flex items-center justify-between py-1">
                    <span>
                      {x.displayName} <span className="text-xs text-slate-500">— {x.unitName}</span>
                    </span>
                    <button className="btn text-xs" disabled={m.isPending} onClick={() => m.mutate({ path: '/members', body: { uid: x.uid, role } })}>
                      Mời
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}

const DECISION_LABELS = { APPROVE: 'Thông qua', REVISE: 'Thông qua có chỉnh sửa / đánh giá lại', REJECT: 'Không thông qua' } as const;

function ResultsTab({ d }: { d: Detail }) {
  const m = useCouncilMutation(d.item.id);
  const ai = useAiStatus();
  const qc = useQueryClient();
  const [text, setText] = useState(d.item.minutes?.text ?? '');
  const [conclusions, setConclusions] = useState<Record<string, { decision: 'APPROVE' | 'REVISE' | 'REJECT'; note: string }>>(d.item.conclusions ?? {});
  useEffect(() => setText(d.item.minutes?.text ?? ''), [d.item.minutes?.text]);
  const draft = useMutation({
    mutationFn: () => api<AiDraft>(`/councils/${d.item.id}/minutes/draft`, { method: 'POST' }),
    onSuccess: (r) => {
      setText(r.text);
      void qc.invalidateQueries({ queryKey: ['councils', d.item.id] });
    },
  });
  const leader = d.permissions.manage || d.permissions.chair || d.permissions.secretary;
  const editable = leader && d.item.status === 'SCORING_CLOSED';
  const codeOf = useMemo(() => new Map(d.item.targets.map((t) => [t.id, t.code])), [d.item.targets]);
  if (!d.item.results) return <Empty>Kết quả hiển thị sau khi chủ tịch hội đồng khóa phiếu.</Empty>;
  return (
    <div className="space-y-5">
      <Card title={`Tổng hợp điểm (thang ${d.maxTotal}, ngưỡng đề nghị ${d.item.rubric.passThreshold})`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Hồ sơ</th>
                <th className="text-right">Phiếu</th>
                <th className="text-right">Trung bình</th>
                <th className="text-right">Thấp – cao</th>
                {d.item.rubric.criteria.map((c) => (
                  <th key={c.key} className="max-w-28 text-right normal-case" title={`${c.label} (tối đa ${c.maxScore})`}>
                    {c.label.split(/[,(]/)[0].trim()}
                  </th>
                ))}
                <th>Đề nghị theo ngưỡng</th>
                <th>Kết luận hội đồng</th>
              </tr>
            </thead>
            <tbody>
              {d.item.results.map((r) => (
                <tr key={r.targetId}>
                  <td>
                    <span className="font-mono text-xs">{r.code}</span>
                    <div className="text-xs text-slate-600">{r.title}</div>
                  </td>
                  <td className="text-right tabular-nums">
                    {r.submitted}/{r.eligible}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{r.average ?? '—'}</td>
                  <td className="text-right tabular-nums">{r.min === null ? '—' : `${r.min} – ${r.max}`}</td>
                  {d.item.rubric.criteria.map((c) => (
                    <td key={c.key} className="text-right tabular-nums">
                      {r.byCriterion[c.key] ?? '—'}
                    </td>
                  ))}
                  <td>
                    <StatusBadge status={r.suggestion === 'PASS' ? 'APPROVED' : r.suggestion === 'FAIL' ? 'REJECTED' : 'DRAFT'} label={r.suggestion === 'PASS' ? 'Đạt ngưỡng' : r.suggestion === 'FAIL' ? 'Dưới ngưỡng' : 'Chưa đủ phiếu'} />
                  </td>
                  <td>
                    {editable ? (
                      <div className="space-y-1">
                        <select
                          className="input text-xs"
                          value={conclusions[r.targetId]?.decision ?? ''}
                          onChange={(e) => setConclusions({ ...conclusions, [r.targetId]: { decision: e.target.value as 'APPROVE', note: conclusions[r.targetId]?.note ?? '' } })}
                          aria-label={`Kết luận ${r.code}`}
                        >
                          <option value="">— Chọn —</option>
                          {Object.entries(DECISION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input text-xs"
                          placeholder="Ghi chú / yêu cầu chỉnh sửa"
                          value={conclusions[r.targetId]?.note ?? ''}
                          onChange={(e) => setConclusions({ ...conclusions, [r.targetId]: { decision: conclusions[r.targetId]?.decision ?? 'REVISE', note: e.target.value } })}
                        />
                      </div>
                    ) : d.item.conclusions?.[r.targetId] ? (
                      <span className="text-sm">
                        {DECISION_LABELS[d.item.conclusions[r.targetId].decision]}
                        {d.item.conclusions[r.targetId].note && <div className="text-xs text-slate-500">{d.item.conclusions[r.targetId].note}</div>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Điểm trung bình cộng các phiếu đã nộp của thành viên không xung đột lợi ích. "Đề nghị theo ngưỡng" là phép tính; kết luận do hội đồng quyết định.</p>
      </Card>
      {d.allSheets && (
        <Card title="Phiếu chấm chi tiết">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Hồ sơ</th>
                  <th>Thành viên</th>
                  <th className="text-right">Tổng</th>
                  <th>Nhận xét</th>
                </tr>
              </thead>
              <tbody>
                {d.allSheets
                  .filter((s) => s.status === 'SUBMITTED')
                  .map((s) => (
                    <tr key={s.memberUid + s.targetId}>
                      <td className="font-mono text-xs">{codeOf.get(s.targetId)}</td>
                      <td>{s.memberName}</td>
                      <td className="text-right tabular-nums">{s.total}</td>
                      <td className="whitespace-pre-wrap text-xs">{s.comment}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card
        title="Biên bản"
        actions={
          <span className="flex gap-2">
            {d.item.minutes && <DownloadButton path={`/exports/councils/${d.item.id}/minutes-docx`} name="Bien_ban.docx" label="⬇ Word" className="btn text-xs" />}
            {editable && (
            <button className="btn text-xs" disabled={!ai.data?.enabled || draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? 'Đang dự thảo…' : '✨ AI dự thảo biên bản'}
            </button>
          )}
          </span>
        }
      >
        <ErrorBox error={draft.error ?? m.error} />
        {editable ? (
          <>
            <textarea className="input font-mono text-xs" rows={16} value={text} onChange={(e) => setText(e.target.value)} aria-label="Nội dung biên bản" />
            {draft.data && <AiMeta d={draft.data} />}
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn" disabled={m.isPending || text.trim().length < 10} onClick={() => m.mutate({ method: 'PUT', path: '/minutes', body: { text, conclusions } })}>
                Lưu biên bản và kết luận
              </button>
              {d.permissions.chair && (
                <button
                  className="btn btn-primary"
                  disabled={m.isPending}
                  onClick={() => confirm('Xác nhận biên bản? Sau khi xác nhận không sửa được và thành viên hết quyền xem hồ sơ.') && m.mutate({ path: '/minutes/confirm' })}
                >
                  Chủ tịch xác nhận biên bản
                </button>
              )}
            </div>
            {d.item.minutes && <p className="mt-1 text-xs text-slate-500">Lưu lần cuối {fmtDateTime(d.item.minutes.updatedAt)} · {d.item.minutes.updatedByName}</p>}
          </>
        ) : d.item.minutes ? (
          <>
            <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{d.item.minutes.text}</pre>
            {d.item.confirmedAt && (
              <p className="mt-2 text-sm text-emerald-800">
                ✓ Chủ tịch {d.item.confirmedByName} xác nhận lúc {fmtDateTime(d.item.confirmedAt)} (phê duyệt điện tử, không phải chữ ký số).
              </p>
            )}
            <button className="btn no-print mt-2 text-xs" onClick={() => window.print()}>
              🖨 In / Lưu PDF
            </button>
          </>
        ) : (
          <Empty>Chưa có biên bản.</Empty>
        )}
      </Card>
    </div>
  );
}

export function CouncilDetailPage() {
  const { id } = useParams() as { id: string };
  const q = useQuery({ queryKey: ['councils', id], queryFn: () => api<Detail>(`/councils/${id}`) });
  const m = useCouncilMutation(id);
  const [tab, setTab] = useState<'targets' | 'members' | 'results'>('targets');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const c = d.item;
  return (
    <>
      <PageHeader
        back={<Link to="/councils" className="link">← Hội đồng</Link>}
        title={c.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.code}</span>
            <CouncilBadge s={c.status} />
            <span>
              · {d.typeLabel} · phiếu "{c.rubric.name}" v{c.rubric.version} · hạn chấm {fmtDate(c.scoringDeadline)}
            </span>
          </span>
        }
        actions={
          <>
            {d.permissions.manage && c.status === 'SETUP' && (
              <button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate({ path: '/open' })}>
                Mở chấm
              </button>
            )}
            {(d.permissions.manage || d.permissions.chair) && c.status === 'SCORING' && (
              <button className="btn btn-primary" disabled={m.isPending} onClick={() => confirm('Khóa phiếu và tổng hợp điểm? Sau khi khóa không ai chấm thêm được.') && m.mutate({ path: '/close' })}>
                Khóa phiếu & tổng hợp
              </button>
            )}
          </>
        }
      />
      <ErrorBox error={m.error} />
      {d.me?.status === 'INVITED' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
          Bạn được mời làm <strong>{COUNCIL_ROLE_LABELS[d.me.role].toLowerCase()}</strong> của hội đồng này.
          <button className="btn btn-primary text-xs" onClick={() => m.mutate({ path: '/respond', body: { accept: true } })}>
            Nhận lời
          </button>
          <button className="btn text-xs" onClick={() => m.mutate({ path: '/respond', body: { accept: false } })}>
            Từ chối
          </button>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'targets', label: 'Hồ sơ & chấm điểm', count: c.targets.length },
          { key: 'members', label: 'Thành viên', count: c.members.length },
          { key: 'results', label: 'Kết quả & biên bản' },
        ]}
      />
      {tab === 'targets' && <TargetsTab d={d} />}
      {tab === 'members' && <MembersTab d={d} />}
      {tab === 'results' && <ResultsTab d={d} />}
    </>
  );
}
