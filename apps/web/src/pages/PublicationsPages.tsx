import { PUBLICATION_TYPE_LABELS, PUBLICATION_WORKFLOW, type DocumentMeta, type Publication, type PublicationAuthor, type PublicationType } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, KeyValue, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { ActionBar, DocumentRow, HistoryList, Uploader, type ActionInfo } from '../components/workflow';
import { api, download } from '../lib/api';
import { useSession } from '../lib/session';

interface PubRow {
  id: string;
  code: string;
  title: string;
  type: PublicationType;
  venue: string;
  year: number;
  doi: string | null;
  status: string;
  ownerName: string;
  unitName: string;
  authors: string;
}

interface Duplicate {
  id: string;
  code: string;
  title: string;
  status: string;
  ownerName: string;
  reason: string;
}

export function PublicationsPage() {
  const { hasRole } = useSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const mine = params.get('mine') ?? '';
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['publications', status, mine],
    queryFn: () => api<{ items: PubRow[] }>(`/publications?${new URLSearchParams({ ...(status && { status }), ...(mine && { mine }) })}`),
  });
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (q.data?.items ?? []).filter((x) => !t || `${x.code} ${x.title} ${x.authors} ${x.doi ?? ''}`.toLowerCase().includes(t));
  }, [q.data, text]);
  return (
    <>
      <PageHeader
        title="Công bố khoa học"
        subtitle="Khai báo, xác minh và xác nhận công bố, sản phẩm nghiên cứu"
        actions={
          <>
            {hasRole('SCIENCE_OFFICER', 'SCIENCE_HEAD') && (
              <button className="btn" onClick={() => download('/publications/export.csv', 'cong-bo-da-xac-nhan.csv')}>
                ⬇ Xuất công bố đã xác nhận
              </button>
            )}
            <Link to="/publications/new" className="btn btn-primary">
              + Khai báo công bố
            </Link>
          </>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="label">
          Trạng thái
          <select className="input mt-1" value={status} onChange={(e) => setParams({ ...(e.target.value && { status: e.target.value }), ...(mine && { mine }) })}>
            <option value="">Tất cả</option>
            {Object.entries(PUBLICATION_WORKFLOW.states).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={mine === '1'} onChange={(e) => setParams({ ...(status && { status }), ...(e.target.checked && { mine: '1' }) })} />
          Chỉ công bố của tôi
        </label>
        <label className="label grow">
          Tìm kiếm
          <input className="input mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mã, tiêu đề, tác giả, DOI…" />
        </label>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && (
        <div className="card overflow-x-auto">
          {items.length === 0 ? (
            <Empty>Chưa có công bố.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Công bố</th>
                  <th>Loại</th>
                  <th>Năm</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap">
                      <Link className="link" to={`/publications/${x.id}`}>
                        {x.code}
                      </Link>
                    </td>
                    <td className="min-w-72">
                      <div>{x.title}</div>
                      <div className="text-xs text-slate-500">
                        {x.authors} · <em>{x.venue}</em>
                        {x.doi && <> · DOI {x.doi}</>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{PUBLICATION_TYPE_LABELS[x.type]}</td>
                    <td>{x.year}</td>
                    <td>
                      <StatusBadge wf="publication" status={x.status} />
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

function DuplicateWarning({ items }: { items: Duplicate[] }) {
  if (!items.length) return null;
  return (
    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-medium">⚠ Có bản ghi nghi trùng — vui lòng kiểm tra (hệ thống không tự gộp/xóa):</div>
      <ul className="mt-1 list-disc pl-5">
        {items.map((d) => (
          <li key={d.id}>
            <Link className="link" to={`/publications/${d.id}`}>
              {d.code}
            </Link>{' '}
            — {d.title} ({d.ownerName}) · <em>{d.reason}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

type PubForm = {
  title: string;
  type: PublicationType;
  venue: string;
  year: number;
  doi: string;
  url: string;
  indexing: string;
  authors: PublicationAuthor[];
};

export function PublicationFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useSession();
  const existing = useQuery({ queryKey: ['publications', id], queryFn: () => api<PubDetail>(`/publications/${id}`), enabled: !!id });
  const [f, setF] = useState<PubForm>({
    title: '',
    type: 'JOURNAL',
    venue: '',
    year: new Date().getFullYear(),
    doi: '',
    url: '',
    indexing: '',
    authors: me ? [{ name: me.displayName, uid: me.uid, isInternal: true, order: 1 }] : [],
  });
  useEffect(() => {
    const p = existing.data?.item;
    if (p) setF({ title: p.title, type: p.type, venue: p.venue, year: p.year, doi: p.doi ?? '', url: p.url ?? '', indexing: p.indexing.join(', '), authors: p.authors });
  }, [existing.data]);

  const [debounced, setDebounced] = useState({ doi: '', title: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ doi: f.doi, title: f.title }), 500);
    return () => clearTimeout(t);
  }, [f.doi, f.title]);
  const dup = useQuery({
    queryKey: ['pub-dup', debounced],
    queryFn: () => api<{ items: Duplicate[] }>(`/publications/check-duplicates?${new URLSearchParams(debounced)}`),
    enabled: debounced.title.length > 10 || debounced.doi.length > 6,
  });

  const m = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title,
        type: f.type,
        venue: f.venue,
        year: Number(f.year),
        doi: f.doi.trim() || null,
        url: f.url.trim() || null,
        indexing: f.indexing.split(',').map((s) => s.trim()).filter(Boolean),
        authors: f.authors.map((a, i) => ({ ...a, order: i + 1 })),
      };
      return id
        ? api<{ id: string }>(`/publications/${id}`, { method: 'PATCH', body: { ...body, expectedVersion: existing.data!.item.version } }).then(() => ({ id }))
        : api<{ id: string }>('/publications', { method: 'POST', body });
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['publications'] });
      nav(`/publications/${r.id}`);
    },
  });

  const people = useQuery({ queryKey: ['people', ''], queryFn: () => api<{ items: { uid: string; displayName: string; unitName: string | null }[] }>('/people') });
  const otherDups = (dup.data?.items ?? []).filter((x) => x.id !== id);

  if (id && existing.isLoading) return <Loading />;
  return (
    <>
      <PageHeader back={<Link to="/publications" className="link">← Công bố</Link>} title={id ? 'Sửa công bố' : 'Khai báo công bố'} />
      <form
        className="card max-w-3xl space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Tiêu đề" required>
          <textarea className="input mt-1" rows={2} required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Loại" required>
            <select className="input mt-1" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as PublicationType })}>
              {Object.entries(PUBLICATION_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Năm công bố" required>
            <input className="input mt-1" type="number" min={1950} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} />
          </Field>
          <Field label="Chỉ mục" help="Cách nhau bởi dấu phẩy (vd: Scopus, WoS, HĐGSNN)">
            <input className="input mt-1" value={f.indexing} onChange={(e) => setF({ ...f, indexing: e.target.value })} />
          </Field>
        </div>
        <Field label="Tạp chí / hội thảo / nhà xuất bản">
          <input className="input mt-1" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="DOI" help="vd: 10.1234/abcd.2026.01">
            <input className="input mt-1" value={f.doi} onChange={(e) => setF({ ...f, doi: e.target.value })} />
          </Field>
          <Field label="Đường dẫn (URL)">
            <input className="input mt-1" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </Field>
        </div>
        <DuplicateWarning items={otherDups} />
        <fieldset>
          <legend className="label">Tác giả (theo thứ tự)</legend>
          <ol className="space-y-2">
            {f.authors.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-right text-sm text-slate-500">{i + 1}.</span>
                <input
                  className="input max-w-xs"
                  value={a.name}
                  aria-label={`Tác giả ${i + 1}`}
                  onChange={(e) => setF({ ...f, authors: f.authors.map((x, j) => (j === i ? { ...x, name: e.target.value, uid: x.isInternal ? x.uid : null } : x)) })}
                />
                <span className="text-xs text-slate-500">{a.uid ? 'Trong trường' : 'Ngoài trường'}</span>
                <button type="button" className="text-xs text-slate-600 hover:underline" disabled={i === 0} onClick={() => setF({ ...f, authors: swap(f.authors, i, i - 1) })}>
                  ↑
                </button>
                <button type="button" className="text-xs text-slate-600 hover:underline" disabled={i === f.authors.length - 1} onClick={() => setF({ ...f, authors: swap(f.authors, i, i + 1) })}>
                  ↓
                </button>
                {f.authors.length > 1 && (
                  <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setF({ ...f, authors: f.authors.filter((_, j) => j !== i) })}>
                    Bỏ
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="input max-w-xs"
              value=""
              onChange={(e) => {
                const p = people.data?.items.find((x) => x.uid === e.target.value);
                if (p) setF({ ...f, authors: [...f.authors, { name: p.displayName, uid: p.uid, isInternal: true, order: f.authors.length + 1 }] });
              }}
            >
              <option value="">+ Thêm tác giả trong trường…</option>
              {people.data?.items
                .filter((p) => !f.authors.some((a) => a.uid === p.uid))
                .map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName} — {p.unitName}
                  </option>
                ))}
            </select>
            <button type="button" className="btn" onClick={() => setF({ ...f, authors: [...f.authors, { name: '', uid: null, isInternal: false, order: f.authors.length + 1 }] })}>
              + Tác giả ngoài trường
            </button>
          </div>
        </fieldset>
        <ErrorBox error={m.error} />
        <div className="flex justify-end gap-2">
          <Link to={id ? `/publications/${id}` : '/publications'} className="btn">
            Hủy
          </Link>
          <button className="btn btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Đang lưu…' : 'Lưu nháp'}
          </button>
        </div>
      </form>
    </>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

interface PubDetail {
  item: Publication;
  actions: ActionInfo[];
  canEdit: boolean;
  documents: DocumentMeta[];
  duplicates: Duplicate[];
}

export function PublicationDetailPage() {
  const { id } = useParams() as { id: string };
  const { me } = useSession();
  const [tab, setTab] = useState<'info' | 'history'>('info');
  const q = useQuery({ queryKey: ['publications', id], queryFn: () => api<PubDetail>(`/publications/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const p = d.item;
  return (
    <>
      <PageHeader
        back={<Link to="/publications" className="link">← Công bố</Link>}
        title={p.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.code}</span>
            <StatusBadge wf="publication" status={p.status} />
            <span>· Người khai báo: {p.ownerName}</span>
          </span>
        }
        actions={
          <>
            {d.canEdit && (
              <Link className="btn" to={`/publications/${id}/edit`}>
                ✎ Sửa
              </Link>
            )}
            <ActionBar kind="publications" id={id} version={p.version} actions={d.actions} />
          </>
        }
      />
      <div className="mb-4">
        <DuplicateWarning items={d.duplicates} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'info', label: 'Thông tin & minh chứng' },
          { key: 'history', label: 'Lịch sử xử lý' },
        ]}
      />
      {tab === 'info' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Thông tin công bố">
            <KeyValue
              items={[
                ['Loại', PUBLICATION_TYPE_LABELS[p.type]],
                ['Năm', p.year],
                ['Nơi công bố', p.venue || '—'],
                ['Chỉ mục', p.indexing.join(', ') || '—'],
                ['DOI', p.doi ? <a className="link" href={`https://doi.org/${p.doiNormalized}`} target="_blank" rel="noreferrer noopener">{p.doi}</a> : '—'],
                ['Đường dẫn', p.url ? <a className="link break-all" href={p.url} target="_blank" rel="noreferrer noopener">{p.url}</a> : '—'],
                ['Đơn vị', p.unitName],
                ['Tác giả', p.authors.map((a) => (a.uid ? `${a.name}*` : a.name)).join('; ')],
              ]}
            />
            <p className="mt-3 text-xs text-slate-500">* tác giả trong trường. Đề nghị hỗ trợ tài chính cho công bố là hồ sơ riêng (phân hệ Kinh phí — P1).</p>
          </Card>
          <Card title="Minh chứng" actions={d.canEdit && <Uploader parentType="publication" parentId={id} label="Tải minh chứng" />}>
            {d.documents.length === 0 ? (
              <Empty>Chưa có tệp minh chứng. Cần có DOI, đường dẫn hoặc tệp trước khi nộp xác nhận.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.documents.map((x) => (
                  <DocumentRow key={x.id} d={x} canRevoke={d.canEdit && x.uploadedBy === me?.uid} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card title="Lịch sử xử lý">
          <HistoryList kind="publications" id={id} wf="publication" />
        </Card>
      )}
    </>
  );
}
