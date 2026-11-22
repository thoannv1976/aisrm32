import {
  BUDGET_CATEGORIES,
  catLabel,
  EMPTY_PROJECT_HEMIS,
  EVALUATION_RESULTS,
  EXPENSE_STATUS_LABELS,
  FUNDING_SOURCES,
  PROJECT_CLASSIFICATIONS,
  PROJECT_LEVELS,
  SCIENCE_FIELDS,
  SETTLEMENT_LABELS,
  type BudgetCategory,
  type BudgetLine,
  type ExpenseRequest,
  type FinanceSummary,
  type Project,
  type ProjectContract,
  type ProjectHemis,
  type SettlementStatus,
} from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, fmtVnd, KeyValue, Loading, Modal } from '../components/ui';
import { api } from '../lib/api';

// ------------------------------------------------------------------ HEMIS

function Select<T extends Record<string, string>>({ map, value, onChange }: { map: T; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select className="input mt-1" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— Chưa phân loại —</option>
      {Object.entries(map).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function HemisCard({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const h = { ...EMPTY_PROJECT_HEMIS, ...(project.hemis ?? {}) };
  const [f, setF] = useState<ProjectHemis>(h);
  useEffect(() => setF({ ...EMPTY_PROJECT_HEMIS, ...(project.hemis ?? {}) }), [project.hemis]);
  const save = useMutation({
    mutationFn: () => api(`/projects/${project.id}/hemis`, { method: 'PUT', body: { classification: f.classification, level: f.level, field: f.field, fundingSource: f.fundingSource, hostAgency: f.hostAgency, evaluationResult: f.evaluationResult, acceptanceDate: f.acceptanceDate } }),
    onSuccess: () => (setOpen(false), qc.invalidateQueries({ queryKey: ['projects', project.id] })),
  });
  return (
    <Card
      title="Thông tin HEMIS"
      actions={
        canEdit && (
          <button className="btn text-xs" onClick={() => setOpen(true)}>
            ✎ Cập nhật
          </button>
        )
      }
    >
      <KeyValue
        items={[
          ['Cấp', catLabel(PROJECT_LEVELS, h.level)],
          ['Phân loại', catLabel(PROJECT_CLASSIFICATIONS, h.classification)],
          ['Lĩnh vực', catLabel(SCIENCE_FIELDS, h.field)],
          ['Nguồn kinh phí', catLabel(FUNDING_SOURCES, h.fundingSource)],
          ['Cơ quan chủ quản', h.hostAgency ?? '—'],
          ['Kết quả nghiệm thu', catLabel(EVALUATION_RESULTS, h.evaluationResult)],
        ]}
      />
      {h.updatedByName && <p className="mt-2 text-xs text-slate-500">Cập nhật: {h.updatedByName} · {fmtDateTime(h.updatedAt)}</p>}
      <Modal open={open} title="Cập nhật thông tin HEMIS" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cấp đề tài">
              <Select map={PROJECT_LEVELS} value={f.level} onChange={(v) => setF({ ...f, level: v as ProjectHemis['level'] })} />
            </Field>
            <Field label="Phân loại">
              <Select map={PROJECT_CLASSIFICATIONS} value={f.classification} onChange={(v) => setF({ ...f, classification: v as ProjectHemis['classification'] })} />
            </Field>
            <Field label="Lĩnh vực KH&CN">
              <Select map={SCIENCE_FIELDS} value={f.field} onChange={(v) => setF({ ...f, field: v as ProjectHemis['field'] })} />
            </Field>
            <Field label="Nguồn kinh phí">
              <Select map={FUNDING_SOURCES} value={f.fundingSource} onChange={(v) => setF({ ...f, fundingSource: v as ProjectHemis['fundingSource'] })} />
            </Field>
            <Field label="Cơ quan chủ quản">
              <input className="input mt-1" value={f.hostAgency ?? ''} onChange={(e) => setF({ ...f, hostAgency: e.target.value || null })} />
            </Field>
            <Field label="Kết quả nghiệm thu">
              <Select map={EVALUATION_RESULTS} value={f.evaluationResult} onChange={(v) => setF({ ...f, evaluationResult: v as ProjectHemis['evaluationResult'] })} />
            </Field>
            <Field label="Ngày nghiệm thu">
              <input className="input mt-1" type="date" value={f.acceptanceDate ?? ''} onChange={(e) => setF({ ...f, acceptanceDate: e.target.value || null })} />
            </Field>
          </div>
          <ErrorBox error={save.error} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={save.isPending}>
              Lưu
            </button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ------------------------------------------------------------------ Kinh phí

interface FinanceData {
  contract: ProjectContract | null;
  budgetLines: BudgetLine[];
  budgetLocked: boolean;
  settlement: { status: SettlementStatus; note: string | null; updatedAt: string | null; updatedByName: string | null };
  expenses: ExpenseRequest[];
  summary: FinanceSummary;
  proposedBudgetVnd: number | null;
  permissions: { isOffice: boolean; isTeam: boolean; canEditBudget: boolean; canRequest: boolean };
  note: string;
}

const CATS = Object.entries(BUDGET_CATEGORIES) as [BudgetCategory, string][];
const today = () => new Date().toISOString().slice(0, 10);

export function FinanceTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['finance', id], queryFn: () => api<FinanceData>(`/projects/${id}/finance`) });
  const done = () => qc.invalidateQueries({ queryKey: ['finance', id] });
  const [modal, setModal] = useState<'contract' | 'budget' | 'expense' | 'settlement' | { disburse: ExpenseRequest } | null>(null);
  const [contract, setContract] = useState({ contractNo: '', signedDate: today(), valueVnd: 0, fundingSource: '', note: '' });
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [exp, setExp] = useState({ category: 'LABOR' as BudgetCategory, content: '', amountVnd: 0 });
  const [disb, setDisb] = useState({ disbursedVnd: 0, disbursedAt: today(), voucherNo: '' });
  const [settle, setSettle] = useState<{ status: SettlementStatus; note: string }>({ status: 'NOT_STARTED', note: '' });

  const call = useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown }) => api(`/projects/${id}/finance${path}`, { method, body: body ?? {} }),
    onSuccess: () => (setModal(null), done()),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const s = d.summary;
  const pm = d.permissions;
  const openBudget = () => {
    setLines(d.budgetLines.length ? d.budgetLines : [{ category: 'LABOR', amountVnd: d.proposedBudgetVnd ?? 0, note: null }]);
    setModal('budget');
  };
  return (
    <div className="space-y-5">
      <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">{d.note}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Kinh phí đề xuất', d.proposedBudgetVnd],
          ['Giá trị hợp đồng', s.contractValueVnd],
          ['Đã duyệt chi', s.approvedVnd],
          ['Đã giải ngân', s.disbursedVnd],
          ['Còn lại', s.remainingVnd],
        ].map(([l, v]) => (
          <div key={l as string} className="card p-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-lg font-semibold tabular-nums">{fmtVnd(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Hợp đồng"
          actions={
            pm.isOffice && (
              <button
                className="btn text-xs"
                onClick={() => {
                  setContract({ contractNo: d.contract?.contractNo ?? '', signedDate: d.contract?.signedDate ?? today(), valueVnd: d.contract?.valueVnd ?? d.proposedBudgetVnd ?? 0, fundingSource: d.contract?.fundingSource ?? '', note: d.contract?.note ?? '' });
                  setModal('contract');
                }}
              >
                {d.contract ? '✎ Sửa' : '+ Nhập hợp đồng'}
              </button>
            )
          }
        >
          {d.contract ? (
            <KeyValue items={[['Số hợp đồng', d.contract.contractNo], ['Ngày ký', fmtDate(d.contract.signedDate)], ['Giá trị', fmtVnd(d.contract.valueVnd)], ['Nguồn kinh phí', d.contract.fundingSource ?? '—'], ['Ghi chú', d.contract.note ?? '—'], ['Cập nhật', `${d.contract.updatedByName} · ${fmtDateTime(d.contract.updatedAt)}`]]} />
          ) : (
            <Empty>Chưa nhập hợp đồng thực hiện đề tài.</Empty>
          )}
        </Card>
        <Card
          title={`Dự toán ${d.budgetLocked ? '(đã chốt)' : '(chưa chốt)'}`}
          actions={
            <span className="flex gap-2">
              {pm.canEditBudget && (
                <button className="btn text-xs" onClick={openBudget}>
                  ✎ Lập / sửa dự toán
                </button>
              )}
              {pm.isOffice && d.budgetLines.length > 0 && (
                <button className="btn text-xs" disabled={call.isPending} onClick={() => call.mutate({ path: '/budget', method: 'PUT', body: { lines: d.budgetLines, lock: !d.budgetLocked } })}>
                  {d.budgetLocked ? 'Mở khóa' : '🔒 Chốt dự toán'}
                </button>
              )}
            </span>
          }
        >
          {s.byCategory.length === 0 ? (
            <Empty>Chưa có dự toán. Chủ nhiệm lập dự toán theo mục chi; Phòng KH chốt trước khi đề nghị chi.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mục chi</th>
                  <th className="text-right">Dự toán</th>
                  <th className="text-right">Đã duyệt</th>
                  <th className="text-right">Giải ngân</th>
                </tr>
              </thead>
              <tbody>
                {s.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td>{c.label}</td>
                    <td className="text-right tabular-nums">{fmtVnd(c.budgetVnd)}</td>
                    <td className="text-right tabular-nums">{fmtVnd(c.approvedVnd)}</td>
                    <td className="text-right tabular-nums">{fmtVnd(c.disbursedVnd)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>Tổng</td>
                  <td className="text-right tabular-nums">{fmtVnd(s.budgetTotalVnd)}</td>
                  <td className="text-right tabular-nums">{fmtVnd(s.approvedVnd)}</td>
                  <td className="text-right tabular-nums">{fmtVnd(s.disbursedVnd)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card
        title={`Đề nghị chi (${d.expenses.length})`}
        actions={
          pm.canRequest && (
            <button className="btn btn-primary text-xs" onClick={() => (setExp({ category: d.budgetLines[0]?.category ?? 'LABOR', content: '', amountVnd: 0 }), setModal('expense'))}>
              + Lập đề nghị chi
            </button>
          )
        }
      >
        {!pm.canRequest && pm.isTeam && <p className="mb-2 text-xs text-slate-500">Lập đề nghị chi khi đề tài đang thực hiện và dự toán đã được Phòng KH chốt.</p>}
        {d.expenses.length === 0 ? (
          <Empty>Chưa có đề nghị chi.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Mục chi</th>
                  <th>Nội dung</th>
                  <th className="text-right">Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Giải ngân</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="text-xs">{fmtDate(e.requestedAt.slice(0, 10))}</td>
                    <td className="text-xs">{BUDGET_CATEGORIES[e.category]}</td>
                    <td>
                      {e.content}
                      <div className="text-xs text-slate-500">{e.requestedByName}{e.decisionNote ? ` · ${e.decisionNote}` : ''}</div>
                    </td>
                    <td className="text-right tabular-nums">{fmtVnd(e.amountVnd)}</td>
                    <td className="text-xs">{EXPENSE_STATUS_LABELS[e.status]}</td>
                    <td className="text-xs">{e.status === 'DISBURSED' ? `${fmtVnd(e.disbursedVnd)} · ${fmtDate(e.disbursedAt)} · CT ${e.voucherNo}` : '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      {pm.isOffice && e.status === 'PENDING' && (
                        <>
                          <button className="btn text-xs" disabled={call.isPending} onClick={() => call.mutate({ path: `/expenses/${e.id}/approve` })}>
                            Duyệt
                          </button>{' '}
                          <button
                            className="btn text-xs"
                            disabled={call.isPending}
                            onClick={() => {
                              const note = prompt('Lý do không duyệt:');
                              if (note?.trim()) call.mutate({ path: `/expenses/${e.id}/reject`, body: { note } });
                            }}
                          >
                            Không duyệt
                          </button>
                        </>
                      )}
                      {pm.isOffice && e.status === 'APPROVED' && (
                        <button className="btn text-xs" onClick={() => (setDisb({ disbursedVnd: e.amountVnd, disbursedAt: today(), voucherNo: '' }), setModal({ disburse: e }))}>
                          Ghi nhận giải ngân
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={call.error} />
      </Card>
      <Card
        title="Quyết toán"
        actions={
          pm.isOffice && (
            <button className="btn text-xs" onClick={() => (setSettle({ status: d.settlement.status, note: d.settlement.note ?? '' }), setModal('settlement'))}>
              ✎ Cập nhật
            </button>
          )
        }
      >
        <KeyValue items={[['Tình trạng', SETTLEMENT_LABELS[d.settlement.status]], ['Ghi chú', d.settlement.note ?? '—'], ['Cập nhật', d.settlement.updatedByName ? `${d.settlement.updatedByName} · ${fmtDateTime(d.settlement.updatedAt)}` : '—']]} />
      </Card>

      <Modal open={modal === 'contract'} title="Hợp đồng thực hiện đề tài" onClose={() => setModal(null)}>
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), call.mutate({ path: '/contract', method: 'PUT', body: { ...contract, fundingSource: contract.fundingSource || null, note: contract.note || null } }))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Số hợp đồng" required>
              <input className="input mt-1" required value={contract.contractNo} onChange={(e) => setContract({ ...contract, contractNo: e.target.value })} />
            </Field>
            <Field label="Ngày ký" required>
              <input className="input mt-1" type="date" required value={contract.signedDate} onChange={(e) => setContract({ ...contract, signedDate: e.target.value })} />
            </Field>
            <Field label="Giá trị (VND)" required>
              <input className="input mt-1" type="number" min={0} required value={contract.valueVnd} onChange={(e) => setContract({ ...contract, valueVnd: Number(e.target.value) })} />
            </Field>
            <Field label="Nguồn kinh phí">
              <input className="input mt-1" value={contract.fundingSource} onChange={(e) => setContract({ ...contract, fundingSource: e.target.value })} />
            </Field>
          </div>
          <Field label="Ghi chú">
            <textarea className="input mt-1" rows={2} value={contract.note} onChange={(e) => setContract({ ...contract, note: e.target.value })} />
          </Field>
          <ErrorBox error={call.error} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={call.isPending}>Lưu</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'budget'} title="Dự toán theo mục chi" onClose={() => setModal(null)}>
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), call.mutate({ path: '/budget', method: 'PUT', body: { lines } }))}>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_150px_auto] items-end gap-2">
              <Field label={i === 0 ? 'Mục chi' : ''}>
                <select className="input mt-1" value={l.category} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, category: e.target.value as BudgetCategory } : x)))}>
                  {CATS.map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label={i === 0 ? 'Số tiền (VND)' : ''}>
                <input className="input mt-1" type="number" min={0} value={l.amountVnd} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amountVnd: Number(e.target.value) } : x)))} />
              </Field>
              <button type="button" className="btn text-xs" aria-label="Bỏ dòng" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn text-xs" onClick={() => setLines([...lines, { category: 'OTHER', amountVnd: 0, note: null }])}>+ Thêm mục</button>
          <p className="text-sm">Tổng: <strong>{fmtVnd(lines.reduce((a, l) => a + (l.amountVnd || 0), 0))}</strong> {d.proposedBudgetVnd ? `/ đã duyệt ${fmtVnd(d.contract?.valueVnd ?? d.proposedBudgetVnd)}` : ''}</p>
          <ErrorBox error={call.error} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={call.isPending}>Lưu dự toán</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'expense'} title="Đề nghị chi" onClose={() => setModal(null)}>
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), call.mutate({ path: '/expenses', body: exp }))}>
          <Field label="Mục chi" required>
            <select className="input mt-1" value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value as BudgetCategory })}>
              {d.budgetLines.map((l) => (
                <option key={l.category} value={l.category}>{BUDGET_CATEGORIES[l.category]}</option>
              ))}
            </select>
          </Field>
          <Field label="Nội dung chi" required>
            <textarea className="input mt-1" rows={2} required value={exp.content} onChange={(e) => setExp({ ...exp, content: e.target.value })} />
          </Field>
          <Field label="Số tiền (VND)" required>
            <input className="input mt-1" type="number" min={1} required value={exp.amountVnd} onChange={(e) => setExp({ ...exp, amountVnd: Number(e.target.value) })} />
          </Field>
          <ErrorBox error={call.error} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={call.isPending}>Gửi đề nghị</button>
          </div>
        </form>
      </Modal>

      <Modal open={typeof modal === 'object' && modal !== null} title="Ghi nhận giải ngân" onClose={() => setModal(null)}>
        {typeof modal === 'object' && modal !== null && (
          <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), call.mutate({ path: `/expenses/${modal.disburse.id}/disburse`, body: disb }))}>
            <p className="text-sm">{modal.disburse.content} — đã duyệt {fmtVnd(modal.disburse.amountVnd)}</p>
            <Field label="Số tiền giải ngân (VND)" required>
              <input className="input mt-1" type="number" min={0} max={modal.disburse.amountVnd} required value={disb.disbursedVnd} onChange={(e) => setDisb({ ...disb, disbursedVnd: Number(e.target.value) })} />
            </Field>
            <Field label="Ngày giải ngân" required>
              <input className="input mt-1" type="date" required value={disb.disbursedAt} onChange={(e) => setDisb({ ...disb, disbursedAt: e.target.value })} />
            </Field>
            <Field label="Số chứng từ (theo Phòng Tài chính)" required>
              <input className="input mt-1" required value={disb.voucherNo} onChange={(e) => setDisb({ ...disb, voucherNo: e.target.value })} />
            </Field>
            <ErrorBox error={call.error} />
            <div className="flex justify-end">
              <button className="btn btn-primary" disabled={call.isPending}>Ghi nhận</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={modal === 'settlement'} title="Quyết toán đề tài" onClose={() => setModal(null)}>
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), call.mutate({ path: '/settlement', method: 'PUT', body: { status: settle.status, note: settle.note || null } }))}>
          <Field label="Tình trạng">
            <select className="input mt-1" value={settle.status} onChange={(e) => setSettle({ ...settle, status: e.target.value as SettlementStatus })}>
              {Object.entries(SETTLEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Ghi chú">
            <textarea className="input mt-1" rows={2} value={settle.note} onChange={(e) => setSettle({ ...settle, note: e.target.value })} />
          </Field>
          <ErrorBox error={call.error} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={call.isPending}>Lưu</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ Nhật ký hướng dẫn

interface Log {
  id: string;
  date: string;
  content: string;
  nextSteps: string | null;
  byName: string;
}

export function SupervisionTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supervision', id], queryFn: () => api<{ items: Log[]; canWrite: boolean }>(`/projects/${id}/supervision-logs`) });
  const [f, setF] = useState({ date: today(), content: '', nextSteps: '' });
  const add = useMutation({
    mutationFn: () => api(`/projects/${id}/supervision-logs`, { method: 'POST', body: { ...f, nextSteps: f.nextSteps || null } }),
    onSuccess: () => (setF({ date: today(), content: '', nextSteps: '' }), qc.invalidateQueries({ queryKey: ['supervision', id] })),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card title="Nhật ký hướng dẫn">
        {q.data!.items.length === 0 ? (
          <Empty>Chưa có buổi hướng dẫn nào được ghi.</Empty>
        ) : (
          <ol className="space-y-3">
            {q.data!.items.map((l) => (
              <li key={l.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="text-xs text-slate-500">{fmtDate(l.date)} · {l.byName}</div>
                <p className="mt-1 whitespace-pre-wrap">{l.content}</p>
                {l.nextSteps && <p className="mt-1 text-slate-600">Việc tiếp theo: {l.nextSteps}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
      {q.data!.canWrite && (
        <Card title="Ghi buổi hướng dẫn">
          <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
            <Field label="Ngày">
              <input className="input mt-1" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <Field label="Nội dung trao đổi" required>
              <textarea className="input mt-1" rows={4} required value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
            </Field>
            <Field label="Việc tiếp theo">
              <textarea className="input mt-1" rows={2} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} />
            </Field>
            <ErrorBox error={add.error} />
            <button className="btn btn-primary" disabled={add.isPending}>Lưu</button>
          </form>
        </Card>
      )}
    </div>
  );
}
