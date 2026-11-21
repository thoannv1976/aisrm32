import { PROPOSAL_WORKFLOW, type CallForm, type DocumentMeta, type FormIssue, type Proposal, type ProposalMember, type ProposalRevision } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, fmtVnd, KeyValue, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { ActionBar, DocumentRow, HistoryList, Uploader, type ActionInfo } from '../components/workflow';
import { api, download } from '../lib/api';
import { useSession } from '../lib/session';

interface ProposalRow {
  id: string;
  code: string;
  title: string;
  status: string;
  ownerName: string;
  unitName: string;
  callCode: string;
  callTitle: string;
  budgetVnd: number | null;
  updatedAt: string;
  submittedAt: string | null;
}

export function ProposalsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const mine = params.get('mine') ?? '';
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['proposals', status, mine],
    queryFn: () => api<{ items: ProposalRow[] }>(`/proposals?${new URLSearchParams({ ...(status && { status }), ...(mine && { mine }) })}`),
  });
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (q.data?.items ?? []).filter((x) => !t || `${x.code} ${x.title} ${x.ownerName}`.toLowerCase().includes(t));
  }, [q.data, text]);

  return (
    <>
      <PageHeader
        title="Đề xuất đề tài"
        subtitle="Hồ sơ đề xuất trong phạm vi bạn được xem"
        actions={
          <>
            <button className="btn" onClick={() => download('/dashboard/export.csv?dataset=proposals', 'de-xuat.csv')}>
              ⬇ Xuất CSV
            </button>
            <Link to="/calls" className="btn btn-primary">
              + Tạo đề xuất
            </Link>
          </>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="label">
          Trạng thái
          <select className="input mt-1" value={status} onChange={(e) => setParams({ ...(e.target.value && { status: e.target.value }), ...(mine && { mine }) })}>
            <option value="">Tất cả</option>
            {Object.entries(PROPOSAL_WORKFLOW.states).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={mine === '1'} onChange={(e) => setParams({ ...(status && { status }), ...(e.target.checked && { mine: '1' }) })} />
          Chỉ hồ sơ của tôi
        </label>
        <label className="label grow">
          Tìm kiếm
          <input className="input mt-1" placeholder="Mã, tên đề tài, chủ nhiệm…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && (
        <div className="card overflow-x-auto">
          {items.length === 0 ? (
            <Empty>Không có hồ sơ phù hợp.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên đề tài</th>
                  <th>Chủ nhiệm</th>
                  <th>Đơn vị</th>
                  <th className="text-right">Kinh phí</th>
                  <th>Trạng thái</th>
                  <th>Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap">
                      <Link className="link" to={`/proposals/${x.id}`}>
                        {x.code}
                      </Link>
                    </td>
                    <td className="min-w-64">{x.title || <em className="text-slate-400">(chưa đặt tên)</em>}</td>
                    <td>{x.ownerName}</td>
                    <td>{x.unitName}</td>
                    <td className="whitespace-nowrap text-right">{fmtVnd(x.budgetVnd)}</td>
                    <td>
                      <StatusBadge wf="proposal" status={x.status} />
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{fmtDate(x.updatedAt)}</td>
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

interface ProposalDetail {
  item: Proposal;
  actions: ActionInfo[];
  canEdit: boolean;
  form: CallForm;
  call: { id: string; code: string; title: string; closeAt: string; isOpenNow: boolean };
  documents: DocumentMeta[];
  issues: FormIssue[];
}

type Draft = Pick<Proposal, 'title' | 'fields' | 'budgetVnd' | 'durationMonths' | 'members'>;

function MembersEditor({ members, onChange, disabled }: { members: ProposalMember[]; onChange: (m: ProposalMember[]) => void; disabled: boolean }) {
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['people', q],
    queryFn: () => api<{ items: { uid: string; displayName: string; unitName: string | null }[] }>(`/people?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Họ tên</th>
            <th>Vai trò</th>
            <th>Đơn vị</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <tr key={i}>
              <td>{m.name}</td>
              <td>{m.role === 'PI' ? 'Chủ nhiệm' : m.role === 'SECRETARY' ? 'Thư ký' : 'Thành viên'}</td>
              <td>{m.unitName ?? (m.uid ? '' : 'Ngoài trường')}</td>
              <td className="text-right">
                {m.role !== 'PI' && !disabled && (
                  <button className="text-xs text-red-700 hover:underline" onClick={() => onChange(members.filter((_, j) => j !== i))}>
                    Bỏ
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <div className="relative grow">
            <input className="input" placeholder="Tìm thành viên trong trường (gõ ít nhất 2 ký tự)…" value={q} onChange={(e) => setQ(e.target.value)} />
            {search.data && q.trim().length >= 2 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                {search.data.items
                  .filter((p) => !members.some((m) => m.uid === p.uid))
                  .map((p) => (
                    <li key={p.uid}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          onChange([...members, { uid: p.uid, name: p.displayName, role: 'MEMBER', unitName: p.unitName }]);
                          setQ('');
                        }}
                      >
                        {p.displayName} <span className="text-slate-500">— {p.unitName}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const name = prompt('Họ tên thành viên ngoài trường:');
              if (name?.trim()) onChange([...members, { uid: null, name: name.trim(), role: 'MEMBER', unitName: null }]);
            }}
          >
            + Thành viên ngoài trường
          </button>
        </div>
      )}
    </div>
  );
}

function RevisionsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['proposals', id, 'revisions'], queryFn: () => api<{ items: ProposalRevision[] }>(`/proposals/${id}/revisions`) });
  const [open, setOpen] = useState<number | null>(null);
  if (q.isLoading) return <Loading />;
  if (!q.data?.items.length) return <Empty>Chưa có bản nộp nào.</Empty>;
  return (
    <ul className="space-y-2">
      {q.data.items.map((r) => (
        <li key={r.revisionNo} className="rounded-md border border-slate-200">
          <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" onClick={() => setOpen(open === r.revisionNo ? null : r.revisionNo)}>
            <span>
              <strong>Bản nộp #{r.revisionNo}</strong> · {fmtDateTime(r.submittedAt)}
            </span>
            <span>{open === r.revisionNo ? '▲' : '▼'}</span>
          </button>
          {open === r.revisionNo && (
            <div className="border-t border-slate-100 p-3 text-sm">
              <p className="mb-2 text-xs text-slate-500">Bản lưu bất biến tại thời điểm nộp.</p>
              <KeyValue
                items={[
                  ['Tên đề tài', r.snapshot.title],
                  ['Kinh phí', fmtVnd(r.snapshot.budgetVnd)],
                  ['Thời gian', r.snapshot.durationMonths ? `${r.snapshot.durationMonths} tháng` : '—'],
                  ['Số tài liệu', r.snapshot.documentIds.length],
                  ...Object.entries(r.snapshot.fields).map(([k, v]) => [k, <span className="whitespace-pre-wrap">{String(v ?? '')}</span>] as [string, React.ReactNode]),
                ]}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProposalDetailPage() {
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();
  const { me } = useSession();
  const [tab, setTab] = useState<'form' | 'docs' | 'history' | 'revisions'>('form');
  const q = useQuery({ queryKey: ['proposals', id], queryFn: () => api<ProposalDetail>(`/proposals/${id}`) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      const p = q.data.item;
      setDraft({ title: p.title, fields: { ...p.fields }, budgetVnd: p.budgetVnd, durationMonths: p.durationMonths, members: p.members });
    }
  }, [q.data]);

  const dirty = useMemo(() => {
    if (!q.data || !draft) return false;
    const p = q.data.item;
    return JSON.stringify({ t: p.title, f: p.fields, b: p.budgetVnd, d: p.durationMonths, m: p.members }) !== JSON.stringify({ t: draft.title, f: draft.fields, b: draft.budgetVnd, d: draft.durationMonths, m: draft.members });
  }, [q.data, draft]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => api(`/proposals/${id}`, { method: 'PATCH', body: { expectedVersion: q.data!.item.version, ...draft } }),
    onSuccess: async () => {
      setSavedAt(new Date().toISOString());
      await qc.invalidateQueries({ queryKey: ['proposals', id] });
    },
  });

  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading || !draft) return <Loading />;
  const d = q.data!;
  const p = d.item;
  const editable = d.canEdit;
  const issueFor = (k: string) => d.issues.find((i) => i.field === k)?.message;
  const docsByKey = (k: string) => d.documents.filter((x) => x.checklistKey === k);
  const otherDocs = d.documents.filter((x) => !d.form.checklist.some((c) => c.key === x.checklistKey));

  return (
    <>
      <PageHeader
        back={<Link to="/proposals" className="link">← Đề xuất</Link>}
        title={p.title || <span className="text-slate-400">(chưa đặt tên đề tài)</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.code}</span>
            <StatusBadge wf="proposal" status={p.status} />
            <span>· {p.ownerName} · {p.unitName}</span>
            <span>· Đợt: {d.call.code}</span>
          </span>
        }
        actions={
          <>
            {editable && (
              <button className="btn" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? 'Đang lưu…' : dirty ? '💾 Lưu nháp' : 'Đã lưu'}
              </button>
            )}
            {dirty ? (
              <span className="self-center text-xs text-amber-700">Có thay đổi chưa lưu — lưu trước khi nộp</span>
            ) : (
              <ActionBar kind="proposals" id={id} version={p.version} actions={d.actions} />
            )}
          </>
        }
      />
      <ErrorBox error={save.error} />
      {savedAt && !dirty && <p className="mb-2 text-xs text-emerald-700">✓ Đã lưu lúc {fmtDateTime(savedAt)}</p>}

      {p.status === 'NEEDS_REVISION' && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Hồ sơ được trả để bổ sung. Xem lý do ở tab <strong>Lịch sử xử lý</strong>; sau khi nộp lại, hồ sơ quay về bước{' '}
          <strong>{PROPOSAL_WORKFLOW.states[p.returnTo ?? '']?.label ?? '—'}</strong>.
        </div>
      )}
      {p.projectId && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Đề xuất đã được phê duyệt và lập đề tài.{' '}
          <Link className="link" to={`/projects/${p.projectId}`}>
            Mở đề tài →
          </Link>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'form', label: 'Thuyết minh' },
              { key: 'docs', label: 'Tài liệu', count: d.documents.length },
              { key: 'history', label: 'Lịch sử xử lý' },
              { key: 'revisions', label: 'Bản nộp', count: p.currentRevisionNo },
            ]}
          />
          {tab === 'form' && (
            <div className="space-y-5">
              <Card title="Thông tin chung">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Tên đề tài" required error={issueFor('title')}>
                      <input className="input mt-1" value={draft.title} disabled={!editable} maxLength={500} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Kinh phí đề xuất (VND)" required error={issueFor('budgetVnd')} help={draft.budgetVnd ? fmtVnd(draft.budgetVnd) : undefined}>
                    <input
                      className="input mt-1"
                      inputMode="numeric"
                      disabled={!editable}
                      value={draft.budgetVnd ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '');
                        setDraft({ ...draft, budgetVnd: v ? Number(v) : null });
                      }}
                    />
                  </Field>
                  <Field label="Thời gian thực hiện (tháng)" required error={issueFor('durationMonths')}>
                    <input
                      className="input mt-1"
                      type="number"
                      min={1}
                      max={120}
                      disabled={!editable}
                      value={draft.durationMonths ?? ''}
                      onChange={(e) => setDraft({ ...draft, durationMonths: e.target.value ? Number(e.target.value) : null })}
                    />
                  </Field>
                </div>
              </Card>
              <Card title={`Nội dung thuyết minh (biểu mẫu v${p.formVersion})`}>
                <div className="space-y-4">
                  {d.form.fields.map((f) => {
                    const v = draft.fields[f.key] ?? '';
                    const onChange = (val: string) => setDraft({ ...draft, fields: { ...draft.fields, [f.key]: val } });
                    return (
                      <Field key={f.key} label={f.label} required={f.required} help={f.help} error={issueFor(f.key)}>
                        {f.type === 'textarea' ? (
                          <textarea className="input mt-1" rows={4} disabled={!editable} maxLength={f.maxLength} value={String(v)} onChange={(e) => onChange(e.target.value)} />
                        ) : f.type === 'select' ? (
                          <select className="input mt-1" disabled={!editable} value={String(v)} onChange={(e) => onChange(e.target.value)}>
                            <option value="">— Chọn —</option>
                            {f.options?.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="input mt-1" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} disabled={!editable} maxLength={f.maxLength} value={String(v)} onChange={(e) => onChange(e.target.value)} />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </Card>
              <Card title="Thành viên tham gia">
                <MembersEditor members={draft.members} disabled={!editable} onChange={(members) => setDraft({ ...draft, members })} />
              </Card>
            </div>
          )}
          {tab === 'docs' && (
            <Card title="Tài liệu theo danh mục yêu cầu">
              <ul className="divide-y divide-slate-100">
                {d.form.checklist.map((c) => (
                  <li key={c.key} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {docsByKey(c.key).length ? '✅' : c.required ? '⬜' : '◻️'} {c.label}
                        {c.required ? <span className="text-red-600"> *</span> : <span className="font-normal text-slate-500"> (không bắt buộc)</span>}
                      </div>
                      {editable && <Uploader parentType="proposal" parentId={id} checklistKey={c.key} />}
                    </div>
                    <ul className="ml-6">
                      {docsByKey(c.key).map((x) => (
                        <DocumentRow key={x.id} d={x} canRevoke={editable && x.uploadedBy === me?.uid} />
                      ))}
                    </ul>
                  </li>
                ))}
                <li className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Tài liệu khác</div>
                    {editable && <Uploader parentType="proposal" parentId={id} />}
                  </div>
                  <ul className="ml-6">
                    {otherDocs.map((x) => (
                      <DocumentRow key={x.id} d={x} canRevoke={editable && x.uploadedBy === me?.uid} />
                    ))}
                  </ul>
                </li>
              </ul>
              <p className="mt-2 text-xs text-slate-500">Chấp nhận PDF, Word, Excel, PowerPoint, ảnh, TXT/CSV; tối đa 15 MB mỗi tệp. Tệp thuộc bản đã nộp không thể thu hồi.</p>
            </Card>
          )}
          {tab === 'history' && (
            <Card title="Lịch sử xử lý">
              <HistoryList kind="proposals" id={id} wf="proposal" />
            </Card>
          )}
          {tab === 'revisions' && (
            <Card title="Các bản đã nộp">
              <RevisionsTab id={id} />
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {editable && (
            <Card title="Kiểm tra trước khi nộp">
              {d.issues.length === 0 ? (
                <p className="text-sm text-emerald-700">✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.</p>
              ) : (
                <ul className="space-y-1 text-sm text-amber-900">
                  {d.issues.map((i) => (
                    <li key={i.field}>⚠ {i.message}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">Kiểm tra theo quy tắc của biểu mẫu (đã lưu). Trợ lý AI kiểm tra nội dung sẽ có ở Giai đoạn 3.</p>
            </Card>
          )}
          <Card title="Thông tin hồ sơ">
            <KeyValue
              items={[
                ['Đợt', <Link className="link" to={`/calls/${d.call.id}`}>{d.call.title}</Link>],
                ['Hạn nộp', fmtDateTime(d.call.closeAt)],
                ['Ngày nộp gần nhất', fmtDateTime(p.submittedAt)],
                ['Phiên bản dữ liệu', `v${p.version}`],
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
