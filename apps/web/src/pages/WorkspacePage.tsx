import { ROLE_LABELS, type WorkItem } from '@aisrm/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorBox, fmtDate, Loading, PageHeader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

interface Workspace {
  tasks: WorkItem[];
  deadlines: WorkItem[];
  summary: { myProposals: number; myProjects: number; myPublications: number; unreadNotifications: number };
}

const KIND_LABEL: Record<WorkItem['kind'], string> = {
  proposal: 'Đề xuất',
  project: 'Đề tài',
  publication: 'Công bố',
  milestone: 'Mốc',
  change_request: 'Yêu cầu thay đổi',
  council: 'Hội đồng',
};

export function WorkspacePage() {
  const { me, activeRole, hasRole } = useSession();
  const q = useQuery({ queryKey: ['workspace'], queryFn: () => api<Workspace>('/me/workspace') });
  const greeting = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${me?.displayName}`}
        subtitle={`${me?.unitName ?? ''} · ${activeRole ? ROLE_LABELS[activeRole] : ''}`}
        actions={
          <>
            {hasRole('RESEARCHER', 'STUDENT') && (
              <Link to="/calls" className="btn btn-primary">
                + Đăng ký đề tài
              </Link>
            )}
            <Link to="/publications/new" className="btn">
              + Khai báo công bố
            </Link>
          </>
        }
      />
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      {q.data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Việc cần tôi xử lý', q.data.tasks.length, '#tasks'],
              ['Đề xuất của tôi', q.data.summary.myProposals, '/proposals?mine=1'],
              ['Đề tài tham gia', q.data.summary.myProjects, '/projects'],
              ['Công bố của tôi', q.data.summary.myPublications, '/publications?mine=1'],
            ].map(([label, value, to]) => (
              <Link key={label as string} to={to as string} className="card p-4 hover:border-brand-200">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-brand-800">{value}</div>
              </Link>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card title="Việc cần tôi xử lý" className="xl:col-span-2">
              <div id="tasks" />
              {q.data.tasks.length === 0 ? (
                <Empty>Không có hồ sơ nào đang chờ bạn xử lý. 🎉</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Loại</th>
                        <th>Hồ sơ</th>
                        <th>Trạng thái</th>
                        <th>Việc cần làm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.tasks.map((t) => (
                        <tr key={t.kind + t.id}>
                          <td className="whitespace-nowrap text-slate-500">{KIND_LABEL[t.kind]}</td>
                          <td>
                            <Link to={t.link} className="link">
                              {t.code}
                            </Link>
                            <div className="text-slate-700">{t.title}</div>
                          </td>
                          <td>
                            <StatusBadge status={t.status} label={t.statusLabel} />
                          </td>
                          <td className="text-slate-700">{t.actionHint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Thời hạn trong 30 ngày">
              {q.data.deadlines.length === 0 ? (
                <Empty>Không có mốc sắp đến hạn.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {q.data.deadlines.map((d) => (
                    <li key={d.id} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={d.link} className="link text-sm">
                          {d.code}
                        </Link>
                        <StatusBadge status={d.status} label={`${d.statusLabel} · ${fmtDate(d.dueDate)}`} />
                      </div>
                      <div className="text-sm text-slate-700">{d.title}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
