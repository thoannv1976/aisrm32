import { ROLE_LABELS, type AuditEvent, type Role, type Unit } from '@aisrm/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Empty, ErrorBox, fmtDate, fmtDateTime, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { AccountsTab } from './AccountsTab';

const UNIT_TYPE: Record<string, string> = { UNIVERSITY: 'Trường', CAMPUS: 'Cơ sở', FACULTY: 'Khoa', INSTITUTE: 'Viện', OFFICE: 'Phòng/Ban', DEPARTMENT: 'Bộ môn' };

function UnitsTab() {
  const q = useQuery({ queryKey: ['units'], queryFn: () => api<{ items: Unit[] }>('/units') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const items = q.data!.items;
  const children = (id: string | null) => items.filter((u) => u.parentId === id);
  const render = (u: Unit, depth: number): React.ReactNode => (
    <li key={u.id}>
      <div className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: depth * 20 }}>
        <span className="text-slate-400">{depth ? '└' : ''}</span>
        <span className="font-medium">{u.name}</span>
        <span className="text-xs text-slate-500">
          {UNIT_TYPE[u.type]} · {u.code}
        </span>
      </div>
      <ul>{children(u.id).map((c) => render(c, depth + 1))}</ul>
    </li>
  );
  return (
    <Card title="Cơ cấu tổ chức">
      <ul>{children(null).map((u) => render(u, 0))}</ul>
      <p className="mt-3 text-xs text-slate-500">Nguồn chuẩn dự kiến: UNI-DATA360 (đồng bộ một chiều UNI → SRM ở Giai đoạn 3). Hiện là dữ liệu giả lập.</p>
    </Card>
  );
}

interface Binding {
  id: string;
  displayName: string;
  role: Role;
  scopeName: string;
  validUntil: string | null;
  delegatedBy: string | null;
}

function RolesTab() {
  const q = useQuery({ queryKey: ['role-bindings'], queryFn: () => api<{ items: Binding[] }>('/admin/role-bindings') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const items = [...q.data!.items].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
  return (
    <Card title="Phân quyền theo vai trò và phạm vi">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Vai trò</th>
              <th>Phạm vi</th>
              <th>Hiệu lực đến</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>{b.displayName}</td>
                <td>{ROLE_LABELS[b.role] ?? b.role}</td>
                <td>{b.scopeName}</td>
                <td>{b.validUntil ? fmtDate(b.validUntil) : 'Không giới hạn'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Cấp/thu hồi quyền và ủy quyền có thời hạn qua giao diện sẽ bổ sung ở P1; hiện quản lý bằng dữ liệu cấu hình.</p>
    </Card>
  );
}

function AuditTab() {
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<{ items: AuditEvent[] }>('/audit-events') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data!.items.length) return <Empty>Chưa có nhật ký.</Empty>;
  return (
    <Card title="Nhật ký kiểm toán (200 sự kiện gần nhất)">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Kết quả</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.items.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{fmtDateTime(e.at)}</td>
                <td>{e.actorName}</td>
                <td className="font-mono text-xs">{e.action}</td>
                <td className="font-mono text-xs">
                  {e.resourceType}/{e.resourceId}
                  {e.resourceVersion ? ` v${e.resourceVersion}` : ''}
                </td>
                <td>
                  <StatusBadge status={e.result === 'SUCCESS' ? 'APPROVED' : 'REJECTED'} label={e.result === 'SUCCESS' ? 'Thành công' : e.result === 'DENIED' ? 'Bị từ chối' : 'Lỗi'} />
                </td>
                <td className="text-xs text-slate-600">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<'units' | 'accounts' | 'roles' | 'audit'>('units');
  return (
    <>
      <PageHeader title="Quản trị" subtitle="Tổ chức, tài khoản, phân quyền và nhật ký kiểm toán" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'units', label: 'Đơn vị' },
          { key: 'accounts', label: 'Tài khoản' },
          { key: 'roles', label: 'Phân quyền' },
          { key: 'audit', label: 'Nhật ký' },
        ]}
      />
      {tab === 'units' && <UnitsTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
    </>
  );
}
