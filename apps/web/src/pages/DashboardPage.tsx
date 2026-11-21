import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorBox, fmtDate, fmtDateTime, fmtVnd, Loading, PageHeader } from '../components/ui';
import { api, download } from '../lib/api';

interface Metrics {
  metricsVersion: string;
  generatedAt: string;
  scope: string;
  dataNote: string;
  tiles: { key: string; label: string; value: number; definition: string }[];
  proposalsByStatus: { status: string; label: string; count: number }[];
  projectsByStatus: { status: string; label: string; count: number }[];
  publicationsByStatus: { status: string; label: string; count: number }[];
  byUnit: { unitName: string; proposals: number; activeProjects: number; confirmedPublications: number; overdue: number }[];
  overdueProjects: { id: string; code: string; title: string; ownerName: string; unitName: string; nextDue: string }[];
}

/** Biểu đồ thanh ngang đơn giản kèm số liệu (bảng tương đương cho trình đọc màn hình). */
function Bars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <Empty>Chưa có dữ liệu.</Empty>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {[...rows].sort((a, b) => b.count - a.count).map((r) => (
              <tr key={r.label}>
                <th scope="row" className="w-40 py-1 pr-2 text-left font-normal text-slate-600">
                  {r.label}
                </th>
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-3 rounded bg-brand-500" style={{ width: `${(r.count / max) * 100}%`, minWidth: 4 }} aria-hidden />
                    <span className="tabular-nums font-medium">{r.count}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Metrics>('/dashboard/metrics') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const m = q.data!;
  return (
    <>
      <PageHeader
        title="Điều hành & báo cáo"
        subtitle={
          <>
            Phạm vi: <strong>{m.scope}</strong> · Cập nhật {fmtDateTime(m.generatedAt)} · Công thức {m.metricsVersion}
          </>
        }
        actions={
          <>
            <button className="btn" onClick={() => download('/dashboard/export.csv?dataset=proposals', 'de-xuat.csv')}>
              ⬇ Đề xuất (CSV)
            </button>
            <button className="btn" onClick={() => download('/dashboard/export.csv?dataset=projects', 'de-tai.csv')}>
              ⬇ Đề tài (CSV)
            </button>
            <button className="btn" onClick={() => download('/dashboard/export.csv?dataset=publications', 'cong-bo.csv')}>
              ⬇ Công bố (CSV)
            </button>
          </>
        }
      />
      <p className="mb-4 text-xs text-slate-500">{m.dataNote}</p>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
        {m.tiles.map((t) => (
          <div key={t.key} className="card p-3" title={t.definition}>
            <div className="text-xs font-medium text-slate-500">{t.label}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${t.key === 'projects_overdue' && t.value > 0 ? 'text-red-700' : 'text-brand-800'}`}>
              {t.key.endsWith('_vnd') ? fmtVnd(t.value) : t.value}
            </div>
            <div className="mt-1 text-[11px] leading-tight text-slate-400">{t.definition}</div>
          </div>
        ))}
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Bars title="Đề xuất theo trạng thái" rows={m.proposalsByStatus} />
        <Bars title="Đề tài theo trạng thái" rows={m.projectsByStatus} />
        <Bars title="Công bố theo trạng thái" rows={m.publicationsByStatus} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Theo đơn vị">
          {m.byUnit.length === 0 ? (
            <Empty>Chưa có dữ liệu.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Đơn vị</th>
                    <th className="text-right">Đề xuất</th>
                    <th className="text-right">Đề tài đang TH</th>
                    <th className="text-right">Công bố XN</th>
                    <th className="text-right">Có mốc quá hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {m.byUnit.map((u) => (
                    <tr key={u.unitName}>
                      <td>{u.unitName}</td>
                      <td className="text-right tabular-nums">{u.proposals}</td>
                      <td className="text-right tabular-nums">{u.activeProjects}</td>
                      <td className="text-right tabular-nums">{u.confirmedPublications}</td>
                      <td className={`text-right tabular-nums ${u.overdue ? 'font-semibold text-red-700' : ''}`}>{u.overdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Đề tài có mốc quá hạn — cần đôn đốc">
          {m.overdueProjects.length === 0 ? (
            <Empty>Không có đề tài quá hạn.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {m.overdueProjects.map((p) => (
                <li key={p.id} className="py-2">
                  <Link className="link" to={`/projects/${p.id}`}>
                    {p.code}
                  </Link>{' '}
                  — {p.title}
                  <div className="text-xs text-slate-500">
                    {p.ownerName} · {p.unitName} · mốc hạn <span className="font-semibold text-red-700">{fmtDate(p.nextDue)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
