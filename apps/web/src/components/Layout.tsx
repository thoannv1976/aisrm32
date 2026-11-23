import { ROLE_LABELS, type NotificationItem, type Role } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { usingEmulators } from '../lib/auth';
import { useSession } from '../lib/session';
import { fmtDateTime } from './ui';

interface MenuItem {
  to: string;
  label: string;
  icon: string;
  roles?: Role[];
}

const OFFICE: Role[] = ['SCIENCE_OFFICER', 'SCIENCE_HEAD'];
const MANAGERS: Role[] = [...OFFICE, 'UNIT_FOCAL', 'UNIT_HEAD', 'VICE_RECTOR', 'RECTOR', 'BOARD'];

const MENU: MenuItem[] = [
  { to: '/', label: 'Trang làm việc', icon: '🏠' },
  { to: '/calls', label: 'Đợt đăng ký', icon: '📣' },
  { to: '/proposals', label: 'Đề xuất', icon: '📝' },
  { to: '/projects', label: 'Đề tài', icon: '📁' },
  { to: '/publications', label: 'Công bố', icon: '📚' },
  { to: '/councils', label: 'Hội đồng', icon: '⚖️' },
  { to: '/student-research', label: 'NCKH sinh viên', icon: '🎓' },
  { to: '/registry', label: 'Danh mục KH&CN', icon: '💡' },
  { to: '/experts', label: 'Chuyên gia & mạng lưới', icon: '🕸️' },
  { to: '/regulations', label: 'Hỏi đáp quy chế', icon: '💬' },
  { to: '/profile', label: 'Hồ sơ khoa học', icon: '👤', roles: ['STUDENT', 'RESEARCHER', 'SUPERVISOR', 'UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR'] },
  { to: '/dashboard', label: 'Điều hành & báo cáo', icon: '📊', roles: MANAGERS },
  { to: '/external-reviewers', label: 'Phản biện ngoài trường', icon: '🧑‍⚖️', roles: ['SCIENCE_OFFICER'] },
  { to: '/delegations', label: 'Ủy quyền', icon: '🔁', roles: ['UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_OFFICER', 'VICE_RECTOR', 'RECTOR'] },
  { to: '/ai', label: 'AI Center', icon: '✨' },
  { to: '/integrations', label: 'Integration Center', icon: '🔗', roles: ['SYS_ADMIN', 'INTEGRATION_ADMIN', 'SCIENCE_HEAD'] },
  { to: '/admin', label: 'Quản trị', icon: '⚙️', roles: ['SYS_ADMIN', 'SCIENCE_HEAD'] },
];

function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationItem[] }>('/me/notifications'),
    refetchInterval: 60_000,
  });
  const read = useMutation({
    mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api('/me/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = q.data?.items.filter((n) => !n.read).length ?? 0;
  return (
    <div className="relative">
      <button className="relative rounded-md p-2 text-white/90 hover:bg-white/10" onClick={() => setOpen((o) => !o)} aria-label={`Thông báo (${unread} chưa đọc)`} aria-expanded={open}>
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(380px,calc(100vw-24px))] rounded-lg border border-slate-200 bg-white text-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Thông báo</span>
            {unread > 0 && (
              <button className="text-xs text-brand-600 hover:underline" onClick={() => readAll.mutate()}>
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {q.data?.items.length ? (
              q.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${n.read ? 'text-slate-500' : ''}`}
                    onClick={() => {
                      if (!n.read) read.mutate(n.id);
                      setOpen(false);
                      if (n.link) nav(n.link);
                    }}
                  >
                    <div className={n.read ? '' : 'font-medium'}>
                      {!n.read && <span className="mr-1 text-brand-600" aria-label="chưa đọc">●</span>}
                      {n.title}
                    </div>
                    <div className="text-xs text-slate-500">{n.body}</div>
                    <div className="text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</div>
                  </button>
                </li>
              ))
            ) : (
              <li className="p-4 text-center text-sm text-slate-500">Chưa có thông báo.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { me, mode, activeRole, setActiveRole, logout, switchTenant } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = MENU.filter((m) => !m.roles || (activeRole && m.roles.includes(activeRole)));

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 bg-brand-800 text-white shadow">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4">
          <button className="rounded p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Mở menu">
            ☰
          </button>
          <Link to="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded bg-white/10" />
            <span>AI-SRM</span>
          </Link>
          <span className="hidden min-w-0 truncate text-sm text-white/70 xl:inline">{me?.tenantName}</span>
          {usingEmulators && (
            <span className="shrink-0 whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-amber-950" title="Môi trường thử với dữ liệu giả lập">
              THỬ NGHIỆM<span className="hidden lg:inline"> · DỮ LIỆU GIẢ</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {me && me.roles.length > 1 && (
              <label className="hidden items-center gap-1 whitespace-nowrap text-xs text-white/80 md:flex">
                Vai trò
                <select className="rounded bg-white/10 px-2 py-1 text-sm text-white" value={activeRole ?? ''} onChange={(e) => setActiveRole(e.target.value as Role)}>
                  {me.roles.map((r) => (
                    <option key={r} value={r} className="text-slate-900">
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {me && me.tenants.length > 1 && (
              <select className="rounded bg-white/10 px-2 py-1 text-sm" value={me.tenantId} onChange={(e) => switchTenant(e.target.value)} aria-label="Chọn trường">
                {me.tenants.map((t) => (
                  <option key={t.id} value={t.id} className="text-slate-900">
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <Notifications />
            <div className="hidden max-w-48 text-right leading-tight lg:block">
              <div className="truncate text-sm font-medium">{me?.displayName}</div>
              <div className="text-[11px] text-white/70">{activeRole ? ROLE_LABELS[activeRole] : ''}</div>
            </div>
            <Link to="/account/password" className="hidden whitespace-nowrap rounded px-2 py-1 text-sm text-white/90 hover:bg-white/10 md:inline">
              Đổi mật khẩu
            </Link>
            <button className="whitespace-nowrap rounded px-2 py-1 text-sm text-white/90 hover:bg-white/10" onClick={() => logout()}>
              Đăng xuất
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-screen-2xl">
        <nav className={`no-print fixed inset-y-14 left-0 z-10 w-60 shrink-0 border-r border-slate-200 bg-white p-3 lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] ${menuOpen ? 'block' : 'hidden'}`} aria-label="Điều hướng chính">
          {me && me.roles.length > 1 && (
            <label className="mb-3 block text-xs text-slate-500 md:hidden">
              Vai trò
              <select className="input mt-1" value={activeRole ?? ''} onChange={(e) => setActiveRole(e.target.value as Role)}>
                {me.roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ul className="space-y-0.5">
            {items.map((m) => (
              <li key={m.to}>
                <NavLink
                  to={m.to}
                  end={m.to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span aria-hidden>{m.icon}</span>
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-3 text-[11px] leading-snug text-slate-400">Menu hiển thị theo vai trò đang chọn. Quyền thực tế luôn được kiểm tra ở máy chủ.</p>
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
