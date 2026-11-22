import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, ErrorBox, fmtDateTime, Loading, StatusBadge } from '../components/ui';
import { api } from '../lib/api';

interface Job {
  name: string;
  label: string;
  dailyAtHour: number;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastSummary: string | null;
  nextRunAt: string | null;
  running: boolean;
}

/** Tác vụ nền: nhắc hạn… Bản Local tự chạy theo giờ hẹn; bản Online quản trị bấm "Chạy ngay". */
export function JobsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-jobs'], queryFn: () => api<{ schedulerEnabled: boolean; items: Job[] }>('/admin/jobs') });
  const run = useMutation({
    mutationFn: (name: string) => api<{ ran: boolean; summary?: string; message?: string }>(`/admin/jobs/${name}/run`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-jobs'] }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <Card title="Tác vụ nền">
      <p className="mb-3 text-sm text-slate-600">
        {q.data!.schedulerEnabled
          ? 'Bộ hẹn giờ đang bật: tác vụ tự chạy mỗi ngày theo giờ hẹn (giờ Việt Nam).'
          : 'Bộ hẹn giờ chưa bật trên máy chủ này (bản Online). Có thể bấm "Chạy ngay" hoặc cấu hình lịch gọi từ hệ thống hẹn giờ của hạ tầng.'}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Tác vụ</th>
            <th>Giờ chạy</th>
            <th>Lần chạy gần nhất</th>
            <th>Kết quả</th>
            <th>Lần kế tiếp</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {q.data!.items.map((j) => (
            <tr key={j.name}>
              <td>{j.label}</td>
              <td>{String(j.dailyAtHour).padStart(2, '0')}:00 hằng ngày</td>
              <td>{j.lastRunAt ? fmtDateTime(j.lastRunAt) : '—'}</td>
              <td className="text-xs">
                {j.running ? <StatusBadge status="SUBMITTED" label="Đang chạy" /> : j.lastOk === null ? '—' : <span className={j.lastOk ? 'text-emerald-700' : 'text-red-700'}>{j.lastSummary}</span>}
              </td>
              <td>{j.nextRunAt ? fmtDateTime(j.nextRunAt) : '—'}</td>
              <td className="text-right">
                <button className="btn btn-sm" disabled={run.isPending || j.running} onClick={() => run.mutate(j.name)}>
                  {run.isPending && run.variables === j.name ? 'Đang chạy…' : 'Chạy ngay'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {run.data && <p className="mt-2 text-sm text-emerald-700">{run.data.ran ? run.data.summary : run.data.message}</p>}
      <ErrorBox error={run.error} />
    </Card>
  );
}
