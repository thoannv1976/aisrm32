import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, Empty, ErrorBox, fmtDateTime, Loading } from '../components/ui';
import { api, ApiFailure } from '../lib/api';

interface AccountItem {
  uid: string;
  displayName: string;
  email: string | null;
  unitId: string | null;
  status: string;
  account: { disabled: boolean; mustChangePassword: boolean; hasPassword: boolean; lastLoginAt: string | null } | null;
}
interface PlanRow {
  line: number;
  email: string;
  displayName: string;
  unitId: string;
  roles: { role: string; scopeId: string | null }[];
  action: 'CREATE' | 'UPDATE';
  errors: string[];
}
interface ResultRow {
  line: number;
  email: string;
  action: 'CREATE' | 'UPDATE';
  rolesAdded: number;
  temporaryPassword: string | null;
}

const SAMPLE = 'email,displayName,unitId,title,roles\ngv.a@truong.edu.vn,TS. Nguyễn Văn A,k-ktqt,Giảng viên,RESEARCHER\n';

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportCard() {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);

  const check = useMutation({
    mutationFn: () => api<{ rows: PlanRow[] }>('/admin/accounts/import', { method: 'POST', body: { csv, dryRun: true } }),
    onSuccess: (r) => {
      setPlan(r.rows);
      setResults(null);
    },
  });
  const run = useMutation({
    mutationFn: () => api<{ results: ResultRow[] }>('/admin/accounts/import', { method: 'POST', body: { csv } }),
    onSuccess: (r) => {
      setResults(r.results);
      setPlan(null);
      void qc.invalidateQueries({ queryKey: ['admin-accounts'] });
    },
    onError: (e) => {
      if (e instanceof ApiFailure && (e.body.details as { rows?: PlanRow[] })?.rows?.length) setPlan((e.body.details as { rows: PlanRow[] }).rows);
    },
  });
  const invalid = plan?.filter((r) => r.errors.length).length ?? 0;
  const created = results?.filter((r) => r.temporaryPassword) ?? [];

  return (
    <Card title="Nhập tài khoản từ CSV">
      <p className="text-sm text-slate-600">
        Cột: <code>email,displayName,unitId,title,roles</code>. Vai trò ngăn cách bằng dấu <code>;</code>; <code>VAI_TRO@maDonVi</code> là vai trò theo đơn vị. Tài khoản đã có chỉ được thêm vai trò, không đổi mật khẩu.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Chọn tệp CSV"
          className="text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setPlan(null);
              setResults(null);
            }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={() => downloadText('mau-tai-khoan.csv', SAMPLE)}>
          Tải tệp mẫu
        </button>
      </div>
      <textarea
        className="input mt-2 h-32 font-mono text-xs"
        aria-label="Nội dung CSV"
        placeholder={SAMPLE}
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setPlan(null);
        }}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn" disabled={!csv.trim() || check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? 'Đang kiểm tra…' : 'Kiểm tra'}
        </button>
        <button className="btn btn-primary" disabled={!plan || invalid > 0 || plan.length === 0 || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Đang nhập…' : plan ? `Nhập ${plan.length} tài khoản` : 'Nhập (kiểm tra trước)'}
        </button>
      </div>
      {check.error ? <ErrorBox error={check.error} /> : null}
      {run.error ? <ErrorBox error={run.error} /> : null}

      {plan && (
        <table className="table mt-3">
          <thead>
            <tr>
              <th>Dòng</th>
              <th>Email</th>
              <th>Họ tên</th>
              <th>Vai trò</th>
              <th>Thao tác / lỗi</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((r) => (
              <tr key={r.line} className={r.errors.length ? 'bg-red-50' : ''}>
                <td>{r.line}</td>
                <td>{r.email}</td>
                <td>{r.displayName}</td>
                <td className="text-xs">{r.roles.map((x) => (x.scopeId ? `${x.role}@${x.scopeId}` : x.role)).join(', ')}</td>
                <td className="text-xs">{r.errors.length ? <span className="text-red-700">{r.errors.join(' ')}</span> : r.action === 'CREATE' ? 'Tạo mới' : 'Thêm vai trò'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {results && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-emerald-700">
            Đã nhập {results.length} dòng: {created.length} tài khoản mới, {results.length - created.length} tài khoản đã có.
          </p>
          {created.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">Mật khẩu tạm chỉ hiện MỘT lần. Tải về và gửi riêng cho từng người; họ phải đổi khi đăng nhập lần đầu.</p>
              <button
                className="btn btn-sm mt-2"
                onClick={() => downloadText('mat-khau-tam.csv', 'email,matKhauTam\n' + created.map((r) => `${csvCell(r.email)},${csvCell(r.temporaryPassword!)}`).join('\n') + '\n')}
              >
                Tải danh sách mật khẩu tạm
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AccountList() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-accounts'], queryFn: () => api<{ mode: string; items: AccountItem[] }>('/admin/accounts') });
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const reset = useMutation({
    mutationFn: (a: AccountItem) => api<{ temporaryPassword: string }>(`/admin/accounts/${a.uid}/reset-password`, { method: 'POST' }).then((r) => ({ a, r })),
    onSuccess: ({ a, r }) => {
      setTemp({ name: a.displayName, password: r.temporaryPassword });
      void qc.invalidateQueries({ queryKey: ['admin-accounts'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (a: AccountItem) => api(`/admin/accounts/${a.uid}/disable`, { method: 'POST', body: { disabled: !a.account?.disabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-accounts'] }),
  });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const local = q.data?.mode === 'local';
  const items = q.data?.items ?? [];
  return (
    <Card title={`Tài khoản (${items.length})`}>
      {!local && <p className="mb-2 text-sm text-slate-600">Bản Online dùng Firebase Auth: đặt lại mật khẩu / khóa tài khoản thực hiện trong bảng điều khiển định danh.</p>}
      {temp && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
          Mật khẩu tạm của <b>{temp.name}</b>: <code className="select-all rounded bg-white px-1">{temp.password}</code> — chỉ hiện một lần; người dùng phải đổi khi đăng nhập.{' '}
          <button className="underline" onClick={() => setTemp(null)}>
            Ẩn
          </button>
        </div>
      )}
      {reset.error ? <ErrorBox error={reset.error} /> : null}
      {toggle.error ? <ErrorBox error={toggle.error} /> : null}
      {items.length === 0 ? (
        <Empty>Chưa có tài khoản.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Đơn vị</th>
              {local && <th>Đăng nhập gần nhất</th>}
              {local && <th>Trạng thái</th>}
              {local && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.uid}>
                <td>{a.displayName}</td>
                <td>{a.email}</td>
                <td>{a.unitId}</td>
                {local && <td>{a.account?.lastLoginAt ? fmtDateTime(a.account.lastLoginAt) : '—'}</td>}
                {local && (
                  <td className="text-xs">
                    {a.account?.disabled ? <span className="text-red-700">Đã khóa</span> : a.account?.mustChangePassword ? 'Chờ đổi mật khẩu tạm' : a.account?.hasPassword ? 'Hoạt động' : 'Chưa có mật khẩu'}
                  </td>
                )}
                {local && (
                  <td className="whitespace-nowrap text-right">
                    <button className="btn btn-sm" disabled={reset.isPending} onClick={() => confirm(`Cấp mật khẩu tạm mới cho ${a.displayName}? Mọi phiên đăng nhập hiện tại của người này sẽ bị đăng xuất.`) && reset.mutate(a)}>
                      Đặt lại mật khẩu
                    </button>{' '}
                    <button className="btn btn-sm" disabled={toggle.isPending} onClick={() => confirm(`${a.account?.disabled ? 'Mở khóa' : 'Khóa'} tài khoản ${a.displayName}?`) && toggle.mutate(a)}>
                      {a.account?.disabled ? 'Mở khóa' : 'Khóa'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function AccountsTab() {
  return (
    <div className="space-y-4">
      <ImportCard />
      <AccountList />
    </div>
  );
}
