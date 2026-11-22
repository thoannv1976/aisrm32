import {
  REGISTRY,
  REGISTRY_KINDS,
  REGISTRY_STATUS_LABELS,
  registryDisplay,
  type DocumentMeta,
  type RegistryDef,
  type RegistryField,
  type RegistryItem,
  type RegistryKind,
} from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DownloadButton, PeoplePicker, PersonPicker, type PersonRef } from '../components/extras';
import { Card, Empty, ErrorBox, Field, fmtDateTime, KeyValue, Loading, PageHeader, StatusBadge } from '../components/ui';
import { DocumentRow, Uploader } from '../components/workflow';
import { api } from '../lib/api';

const TONE: Record<string, string> = { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', NEEDS_REVISION: 'NEEDS_REVISION', CONFIRMED: 'CONFIRMED' };
const badge = (s: string) => <StatusBadge status={TONE[s] ?? s} label={REGISTRY_STATUS_LABELS[s] ?? s} />;

function kindOf(k: string | undefined): RegistryDef | null {
  return k && (REGISTRY_KINDS as readonly string[]).includes(k) ? REGISTRY[k as RegistryKind] : null;
}

/** Trang tổng hợp các danh mục kết quả KH&CN khác. */
export function RegistryHubPage() {
  const counts = useQuery({
    queryKey: ['registry', 'hub'],
    queryFn: async () => Object.fromEntries(await Promise.all(REGISTRY_KINDS.map(async (k) => [k, (await api<{ items: RegistryItem[] }>(`/registry/${k}`)).items] as const))),
  });
  return (
    <>
      <PageHeader title="Danh mục KH&CN" subtitle="Nhóm nghiên cứu, sở hữu trí tuệ, chuyển giao công nghệ, hội thảo, giải thưởng — kê khai, Phòng KH xác nhận, đưa vào hồ sơ khoa học và báo cáo HEMIS." />
      <ErrorBox error={counts.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REGISTRY_KINDS.map((k) => {
          const d = REGISTRY[k];
          const items = counts.data?.[k] ?? [];
          return (
            <Link key={k} to={`/registry/${k}`} className="card block p-4 hover:ring-2 hover:ring-brand-200">
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span aria-hidden>{d.icon}</span>
                {d.plural}
              </div>
              <p className="mt-1 text-sm text-slate-600">{d.description}</p>
              <div className="mt-3 flex gap-3 text-xs text-slate-600">
                <span>Đã xác nhận: <strong>{items.filter((x) => x.status === 'CONFIRMED').length}</strong></span>
                <span>Chờ xác nhận: <strong>{items.filter((x) => x.status === 'SUBMITTED').length}</strong></span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function RegistryListPage() {
  const { kind } = useParams();
  const def = kindOf(kind);
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['registry', kind], queryFn: () => api<{ items: RegistryItem[]; canReview: boolean }>(`/registry/${kind}`), enabled: !!def });
  if (!def) return <ErrorBox error={new Error('Danh mục không tồn tại.')} />;
  const items = (q.data?.items ?? []).filter((x) => !status || x.status === status);
  const cols = def.fields.filter((f) => f.list && f.key !== def.titleField);
  return (
    <>
      <PageHeader
        back={<Link to="/registry" className="link">← Danh mục KH&CN</Link>}
        title={`${def.icon} ${def.plural}`}
        subtitle={def.description}
        actions={
          <>
            <DownloadButton path={`/exports/datasets/${def.kind}`} name={`${def.kind}.xlsx`} label="⬇ Xuất Excel" />
            <Link to={`/registry/${def.kind}/new`} className="btn btn-primary">
              + Kê khai {def.label.toLowerCase()}
            </Link>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Trạng thái
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(REGISTRY_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {q.data?.canReview && <span className="text-slate-500">Bạn có quyền xác nhận bản ghi của người khác.</span>}
      </div>
      <div className="card overflow-x-auto">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : items.length === 0 ? (
          <Empty>Chưa có bản ghi. Bấm “Kê khai” để thêm.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>{def.fields.find((f) => f.key === def.titleField)?.label}</th>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Đơn vị</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-xs">
                    <Link className="link" to={`/registry/${def.kind}/${x.id}`}>
                      {x.code}
                    </Link>
                  </td>
                  <td className="max-w-md">
                    <Link className="link" to={`/registry/${def.kind}/${x.id}`}>
                      {x.title}
                    </Link>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key}>{registryDisplay(c, x.data[c.key])}</td>
                  ))}
                  <td className="text-xs">{x.unitName}</td>
                  <td>{badge(x.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function FieldInput({ f, value, onChange }: { f: RegistryField; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.type) {
    case 'textarea':
      return <textarea className="input mt-1" rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
    case 'money':
    case 'year':
      return <input className="input mt-1" type="number" min={0} value={(value as number | undefined) ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'date':
      return <input className="input mt-1" type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="input mt-1" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">— Chọn —</option>
          {Object.entries(f.options ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      );
    case 'boolean':
      return (
        <span className="mt-2 flex items-center gap-2 text-sm font-normal">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Có
        </span>
      );
    case 'person':
      return <PersonPicker label={f.label} value={(value as PersonRef) ?? null} onChange={(v) => onChange(v ?? undefined)} />;
    case 'people':
      return <PeoplePicker value={(value as PersonRef[]) ?? []} onChange={onChange} />;
    default:
      return <input className="input mt-1" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function RegistryFormPage() {
  const { kind, id } = useParams();
  const def = kindOf(kind);
  const nav = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['registry', kind, id], queryFn: () => api<{ item: RegistryItem }>(`/registry/${kind}/${id}`), enabled: !!id && !!def });
  const [data, setData] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (existing.data) setData(existing.data.item.data);
  }, [existing.data]);
  const save = useMutation({
    mutationFn: () =>
      id
        ? api<{ id: string }>(`/registry/${kind}/${id}`, { method: 'PATCH', body: { data, expectedVersion: existing.data!.item.version } }).then(() => ({ id }))
        : api<{ id: string }>(`/registry/${kind}`, { method: 'POST', body: { data } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['registry'] });
      nav(`/registry/${kind}/${r.id}`);
    },
  });
  if (!def) return <ErrorBox error={new Error('Danh mục không tồn tại.')} />;
  if (id && existing.isLoading) return <Loading />;
  return (
    <>
      <PageHeader back={<Link to={`/registry/${def.kind}`} className="link">← {def.plural}</Link>} title={id ? `Sửa ${def.label.toLowerCase()}` : `Kê khai ${def.label.toLowerCase()}`} subtitle="Lưu nháp, đính kèm minh chứng, rồi Nộp để Phòng KH xác nhận." />
      <form
        className="card max-w-3xl space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.key} className={f.type === 'textarea' || f.type === 'people' || f.key === def.titleField ? 'sm:col-span-2' : ''}>
              <Field label={f.label} required={f.required} help={f.help}>
                <FieldInput f={f} value={data[f.key]} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />
              </Field>
            </div>
          ))}
        </div>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2">
          <Link className="btn" to={id ? `/registry/${def.kind}/${id}` : `/registry/${def.kind}`}>
            Hủy
          </Link>
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu nháp'}
          </button>
        </div>
      </form>
    </>
  );
}

interface RegistryDetail {
  def: RegistryDef;
  item: RegistryItem;
  documents: DocumentMeta[];
  permissions: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canReopen: boolean };
}

export function RegistryDetailPage() {
  const { kind, id } = useParams() as { kind: string; id: string };
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['registry', kind, id], queryFn: () => api<RegistryDetail>(`/registry/${kind}/${id}`) });
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: (action: string) => api(`/registry/${kind}/${id}/${action}`, { method: 'POST', body: { expectedVersion: q.data!.item.version, note: note || undefined } }),
    onSuccess: () => (setNote(''), qc.invalidateQueries({ queryKey: ['registry'] })),
  });
  const del = useMutation({ mutationFn: () => api(`/registry/${kind}/${id}`, { method: 'DELETE' }), onSuccess: () => nav(`/registry/${kind}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { def, item, documents, permissions: pm } = q.data!;
  return (
    <>
      <PageHeader
        back={<Link to={`/registry/${kind}`} className="link">← {def.plural}</Link>}
        title={item.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{item.code}</span> {badge(item.status)} · {def.label} · {item.ownerName} · {item.unitName}
          </span>
        }
        actions={
          <>
            {pm.canEdit && (
              <Link className="btn" to={`/registry/${kind}/${id}/edit`}>
                ✎ Sửa
              </Link>
            )}
            {pm.canEdit && item.status === 'DRAFT' && (
              <button className="btn btn-danger" onClick={() => confirm('Xóa bản nháp này?') && del.mutate()}>
                Xóa nháp
              </button>
            )}
            {pm.canSubmit && (
              <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate('submit')}>
                Nộp để xác nhận
              </button>
            )}
          </>
        }
      />
      <ErrorBox error={act.error ?? del.error} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card title="Thông tin">
            <KeyValue items={def.fields.map((f) => [f.label, registryDisplay(f, item.data[f.key])] as [string, string])} />
          </Card>
          <Card title="Minh chứng" actions={pm.canEdit && <Uploader parentType="registry" parentId={id} label="Tải minh chứng" />}>
            {documents.length === 0 ? <Empty>Chưa có minh chứng (quyết định, văn bằng, hợp đồng…).</Empty> : <ul className="divide-y">{documents.map((d) => <DocumentRow key={d.id} d={d} canRevoke={pm.canEdit} canVersion={pm.canEdit} />)}</ul>}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card title="Xác nhận">
            <KeyValue
              items={[
                ['Trạng thái', badge(item.status)],
                ['Người xác nhận', item.confirmedByName ?? '—'],
                ['Thời điểm', fmtDateTime(item.confirmedAt)],
                ['Ghi chú', item.reviewNote ?? '—'],
              ]}
            />
            {(pm.canReview || pm.canReopen) && (
              <div className="mt-4 space-y-2 border-t pt-3">
                <Field label="Ghi chú / nội dung cần bổ sung">
                  <textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {pm.canReview && (
                    <>
                      <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate('confirm')}>
                        ✓ Xác nhận
                      </button>
                      <button className="btn" disabled={act.isPending || !note.trim()} onClick={() => act.mutate('return')}>
                        ↺ Trả bổ sung
                      </button>
                    </>
                  )}
                  {pm.canReopen && (
                    <button className="btn" disabled={act.isPending || !note.trim()} onClick={() => act.mutate('reopen')}>
                      Mở lại để sửa
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">Không tự xác nhận bản ghi của chính mình. Mọi thao tác được ghi nhật ký.</p>
              </div>
            )}
          </Card>
          {def.hemisTable && (
            <Card title="HEMIS">
              <p className="text-sm text-slate-600">
                Bản ghi đã xác nhận được đưa vào bảng <span className="font-mono">{def.hemisTable}</span> khi xuất báo cáo HEMIS (Điều hành → Xuất báo cáo HEMIS).
              </p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
