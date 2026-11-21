import { PUBLICATION_TYPE_LABELS, type PublicationType } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, fmtDate, Loading, PageHeader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface Profile {
  academicTitle: string;
  degree: string;
  orcid: string;
  googleScholar: string;
  expertise: string[];
  researchInterests: string;
  bio: string;
}

interface ResearcherData {
  uid: string;
  displayName: string;
  title: string | null;
  unitName: string | null;
  profile: Profile | null;
  publications: { id: string; code: string; title: string; venue: string; year: number; doi: string | null; type: PublicationType; authors: string }[];
  projects: { id: string; code: string; title: string; status: string; role: string; startDate: string | null; endDate: string | null }[];
  canEdit: boolean;
  note: string;
}

const EMPTY: Profile = { academicTitle: '', degree: '', orcid: '', googleScholar: '', expertise: [], researchInterests: '', bio: '' };

export function ResearcherPage({ self }: { self?: boolean }) {
  const params = useParams();
  const { me } = useSession();
  const uid = self ? me!.uid : params.uid!;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['researcher', uid], queryFn: () => api<ResearcherData>(`/researchers/${uid}`) });
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Profile>(EMPTY);
  useEffect(() => {
    if (q.data) setF({ ...EMPTY, ...(q.data.profile ?? {}) });
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('/me/profile', { method: 'PUT', body: f }),
    onSuccess: async () => {
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['researcher', uid] });
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const pr = d.profile ?? EMPTY;
  return (
    <>
      <PageHeader
        title={`Lý lịch khoa học — ${d.displayName}`}
        subtitle={`${d.title ?? ''} · ${d.unitName ?? ''}`}
        actions={
          <>
            {d.canEdit && !editing && (
              <button className="btn" onClick={() => setEditing(true)}>
                ✎ Cập nhật thông tin
              </button>
            )}
            <button className="btn" onClick={() => window.print()}>
              🖨 In / Lưu PDF
            </button>
          </>
        }
      />
      <p className="mb-4 rounded-md bg-sky-50 p-3 text-sm text-sky-900">{d.note}</p>
      {editing ? (
        <form
          className="card mb-5 max-w-3xl space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Học hàm">
              <input className="input mt-1" value={f.academicTitle} onChange={(e) => setF({ ...f, academicTitle: e.target.value })} placeholder="GS, PGS…" />
            </Field>
            <Field label="Học vị">
              <input className="input mt-1" value={f.degree} onChange={(e) => setF({ ...f, degree: e.target.value })} placeholder="TS, ThS…" />
            </Field>
            <Field label="ORCID" help="Dạng 0000-0000-0000-0000">
              <input className="input mt-1" value={f.orcid} onChange={(e) => setF({ ...f, orcid: e.target.value })} />
            </Field>
            <Field label="Google Scholar (URL)">
              <input className="input mt-1" type="url" value={f.googleScholar} onChange={(e) => setF({ ...f, googleScholar: e.target.value })} />
            </Field>
          </div>
          <Field label="Chuyên môn" help="Cách nhau bởi dấu phẩy">
            <input className="input mt-1" value={f.expertise.join(', ')} onChange={(e) => setF({ ...f, expertise: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Hướng nghiên cứu">
            <textarea className="input mt-1" rows={3} value={f.researchInterests} onChange={(e) => setF({ ...f, researchInterests: e.target.value })} />
          </Field>
          <Field label="Giới thiệu">
            <textarea className="input mt-1" rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
          </Field>
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={save.isPending}>
              Lưu
            </button>
          </div>
        </form>
      ) : (
        <Card title="Thông tin chung" className="mb-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">Học hàm / học vị</dt>
              <dd>{[pr.academicTitle, pr.degree].filter(Boolean).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">ORCID</dt>
              <dd>{pr.orcid ? <a className="link" href={`https://orcid.org/${pr.orcid}`} target="_blank" rel="noreferrer noopener">{pr.orcid}</a> : '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-slate-500">Chuyên môn</dt>
              <dd className="mt-1 flex flex-wrap gap-1">{pr.expertise.length ? pr.expertise.map((x) => <span key={x} className="rounded bg-brand-50 px-2 py-0.5 text-brand-800">{x}</span>) : '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-slate-500">Hướng nghiên cứu</dt>
              <dd className="whitespace-pre-wrap">{pr.researchInterests || '—'}</dd>
            </div>
            {pr.bio && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-slate-500">Giới thiệu</dt>
                <dd className="whitespace-pre-wrap">{pr.bio}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Đề tài (${d.projects.length})`}>
          {d.projects.length === 0 ? (
            <Empty>Chưa có đề tài được phê duyệt.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.projects.map((p) => (
                <li key={p.id} className="py-2">
                  <Link className="link" to={`/projects/${p.id}`}>
                    {p.code}
                  </Link>{' '}
                  — {p.title}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {p.role} · {fmtDate(p.startDate)} – {fmtDate(p.endDate)} <StatusBadge wf="project" status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Công bố đã xác nhận (${d.publications.length})`}>
          {d.publications.length === 0 ? (
            <Empty>Chưa có công bố được xác nhận.</Empty>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {d.publications.map((p) => (
                <li key={p.id}>
                  {p.authors} ({p.year}). <strong>{p.title}</strong>. <em>{p.venue}</em>.{p.doi && <> DOI: {p.doi}.</>}{' '}
                  <span className="text-xs text-slate-500">[{PUBLICATION_TYPE_LABELS[p.type]}]</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
