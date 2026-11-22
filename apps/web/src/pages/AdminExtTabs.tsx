import { ROLE_LABELS, type Role } from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PersonPicker, type PersonRef } from '../components/extras';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, Loading } from '../components/ui';
import { api } from '../lib/api';

const toIso = (d: string, end = false) => new Date(`${d}T${end ? '23:59:59' : '00:00:00'}+07:00`).toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

interface Delegation {
  id: string;
  toName: string;
  fromName: string;
  roleLabel: string;
  scopeName: string;
  validFrom: string;
  validUntil: string;
  reason?: string;
  active: boolean;
  delegatedBy: string;
}

export function DelegationsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['delegations'], queryFn: () => api<{ items: Delegation[]; delegable: { role: Role; roleLabel: string; scopeId: string | null; scopeName: string }[]; isAdmin: boolean }>('/admin/delegations') });
  const [to, setTo] = useState<PersonRef | null>(null);
  const [from, setFrom] = useState<PersonRef | null>(null);
  const [role, setRole] = useState('');
  const [f, setF] = useState({ validFrom: today(), validUntil: plus(14), reason: '' });
  const create = useMutation({
    mutationFn: () => {
      const [r, scope] = role.split('|');
      return api('/admin/delegations', { method: 'POST', body: { fromUid: from?.uid ?? undefined, toUid: to!.uid, role: r, scopeId: scope || null, validFrom: toIso(f.validFrom), validUntil: toIso(f.validUntil, true), reason: f.reason } });
    },
    onSuccess: () => (setTo(null), setF({ ...f, reason: '' }), qc.invalidateQueries({ queryKey: ['delegations'] })),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/admin/delegations/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['delegations'] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <Card title="Ủy quyền có thời hạn">
        {d.items.length === 0 ? (
          <Empty>Chưa có ủy quyền.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Người ủy quyền → người nhận</th>
                <th>Vai trò / phạm vi</th>
                <th>Thời hạn</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.items.map((x) => (
                <tr key={x.id} className={x.active ? '' : 'text-slate-400'}>
                  <td>
                    {x.fromName} → <strong>{x.toName}</strong>
                    {x.reason && <div className="text-xs text-slate-500">{x.reason}</div>}
                  </td>
                  <td className="text-sm">{x.roleLabel}<div className="text-xs">{x.scopeName}</div></td>
                  <td className="text-xs">{fmtDate(x.validFrom)} – {fmtDate(x.validUntil)}<div>{x.active ? 'Đang hiệu lực' : 'Hết hiệu lực'}</div></td>
                  <td>{x.active && <button className="btn text-xs" disabled={revoke.isPending} onClick={() => confirm('Thu hồi ủy quyền này?') && revoke.mutate(x.id)}>Thu hồi</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Lập ủy quyền">
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), to?.uid && role && create.mutate())}>
          {d.isAdmin && (
            <Field label="Người ủy quyền (để trống = chính bạn)" help="Quản trị lập thay khi người giữ vai trò vắng mặt.">
              <PersonPicker label="Người ủy quyền" value={from} allowExternal={false} onChange={setFrom} />
            </Field>
          )}
          <Field label="Vai trò ủy quyền" required help={from ? 'Nhập đúng vai trò mà người ủy quyền đang giữ.' : undefined}>
            {from ? (
              <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">— Chọn —</option>
                {(['UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR', 'SUPERVISOR', 'REVIEWER'] as Role[]).map((r) => (
                  <option key={r} value={`${r}|`}>{ROLE_LABELS[r]} (toàn trường)</option>
                ))}
              </select>
            ) : (
              <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">— Chọn vai trò của bạn —</option>
                {d.delegable.map((b) => (
                  <option key={`${b.role}|${b.scopeId ?? ''}`} value={`${b.role}|${b.scopeId ?? ''}`}>{b.roleLabel} — {b.scopeName}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Người nhận ủy quyền" required>
            <PersonPicker label="Người nhận" value={to} allowExternal={false} onChange={setTo} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Từ ngày"><input className="input mt-1" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
            <Field label="Đến ngày"><input className="input mt-1" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          </div>
          <Field label="Lý do" required><input className="input mt-1" required minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="vd: Đi công tác nước ngoài" /></Field>
          <ErrorBox error={create.error} />
          <button className="btn btn-primary" disabled={create.isPending || !to?.uid || !role}>Ủy quyền</button>
          <p className="text-xs text-slate-500">Ủy quyền tự hết hiệu lực khi đến hạn; mọi thao tác của người nhận được ghi nhật ký kèm thông tin ủy quyền. Không ủy quyền vai trò quản trị hệ thống.</p>
        </form>
      </Card>
    </div>
  );
}

export function HandoverTab() {
  const qc = useQueryClient();
  const [from, setFrom] = useState<PersonRef | null>(null);
  const [to, setTo] = useState<PersonRef | null>(null);
  const [reason, setReason] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const preview = useQuery({ queryKey: ['handover', from?.uid], queryFn: () => api<{ items: { kind: string; label: string; id: string; code: string; title: string; status: string }[] }>('/admin/handover/preview', { method: 'POST', body: { fromUid: from!.uid } }), enabled: !!from?.uid });
  const run = useMutation({
    mutationFn: () => api<{ moved: number }>('/admin/handover', { method: 'POST', body: { fromUid: from!.uid, toUid: to!.uid, reason, items: preview.data!.items.filter((x) => sel.includes(x.id)).map((x) => ({ kind: x.kind, id: x.id })) } }),
    onSuccess: () => (setSel([]), qc.invalidateQueries()),
  });
  return (
    <Card title="Bàn giao hồ sơ (nghỉ việc, chuyển công tác)">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Người bàn giao"><PersonPicker label="Người bàn giao" value={from} allowExternal={false} onChange={(v) => (setFrom(v), setSel([]))} /></Field>
        <Field label="Người nhận"><PersonPicker label="Người nhận" value={to} allowExternal={false} onChange={setTo} /></Field>
      </div>
      {from && (
        <div className="mt-4">
          {preview.isLoading ? <Loading /> : preview.error ? <ErrorBox error={preview.error} /> : preview.data!.items.length === 0 ? <Empty>Người này không có hồ sơ chưa kết thúc.</Empty> : (
            <table className="table">
              <thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" checked={sel.length === preview.data!.items.length} onChange={(e) => setSel(e.target.checked ? preview.data!.items.map((x) => x.id) : [])} /></th><th>Loại</th><th>Hồ sơ</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {preview.data!.items.map((x) => (
                  <tr key={x.id}>
                    <td><input type="checkbox" aria-label={`Chọn ${x.code}`} checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((y) => y !== x.id))} /></td>
                    <td className="text-xs">{x.label}</td>
                    <td>{x.code} — {x.title}</td>
                    <td className="text-xs">{x.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Lý do bàn giao"><input className="input mt-1 w-80" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="btn btn-primary" disabled={!from?.uid || !to?.uid || sel.length === 0 || reason.trim().length < 3 || run.isPending} onClick={() => confirm(`Bàn giao ${sel.length} hồ sơ cho ${to?.name}?`) && run.mutate()}>Bàn giao {sel.length} hồ sơ</button>
      </div>
      <ErrorBox error={run.error} />
      {run.data && <p className="mt-2 text-sm text-emerald-700">✓ Đã bàn giao {run.data.moved} hồ sơ.</p>}
      <p className="mt-2 text-xs text-slate-500">Người nhận trở thành chủ hồ sơ (chủ nhiệm / người khai); lịch sử và nhật ký giữ nguyên. Hồ sơ đã kết thúc không bàn giao.</p>
    </Card>
  );
}

interface External {
  uid: string;
  displayName: string;
  email: string;
  organization: string | null;
  expertise: string[];
  status: string;
  validUntil: string | null;
  active: boolean;
}

export function ExternalReviewersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['external-reviewers'], queryFn: () => api<{ items: External[] }>('/admin/external-reviewers') });
  const [f, setF] = useState({ email: '', displayName: '', organization: '', title: '', expertise: '', validUntil: plus(90) });
  const create = useMutation({
    mutationFn: () => api<{ temporaryPassword: string | null; note: string; email: string }>('/admin/external-reviewers', { method: 'POST', body: { ...f, title: f.title || null, expertise: f.expertise.split(',').map((s) => s.trim()).filter(Boolean), validUntil: toIso(f.validUntil, true) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['external-reviewers'] }),
  });
  const disable = useMutation({ mutationFn: (uid: string) => api(`/admin/external-reviewers/${uid}/disable`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['external-reviewers'] }) });
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <Card title="Phản biện ngoài trường">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : q.data!.items.length === 0 ? <Empty>Chưa có tài khoản phản biện ngoài trường.</Empty> : (
          <table className="table">
            <thead><tr><th>Họ tên</th><th>Cơ quan / chuyên môn</th><th>Hiệu lực đến</th><th /></tr></thead>
            <tbody>
              {q.data!.items.map((x) => (
                <tr key={x.uid} className={x.active ? '' : 'text-slate-400'}>
                  <td>{x.displayName}<div className="text-xs">{x.email}</div></td>
                  <td className="text-sm">{x.organization}<div className="text-xs text-slate-500">{x.expertise.join(', ')}</div></td>
                  <td className="text-xs">{fmtDate(x.validUntil)}<div>{x.active ? 'Đang hiệu lực' : 'Đã hết / đã khóa'}</div></td>
                  <td>{x.active && <button className="btn text-xs" onClick={() => confirm(`Khóa tài khoản ${x.displayName}?`) && disable.mutate(x.uid)}>Khóa</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">Phản biện ngoài trường chỉ có vai trò Phản biện, chỉ xem hồ sơ được mời chấm sau khi khai báo không xung đột lợi ích; quyền tự hết khi đến hạn. Mời vào hội đồng bằng cách tìm tên trong màn hình Hội đồng.</p>
      </Card>
      <Card title="Tạo tài khoản phản biện">
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Field label="Email" required><input className="input mt-1" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Họ tên" required><input className="input mt-1" required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="Cơ quan công tác" required><input className="input mt-1" required value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></Field>
          <Field label="Học hàm, học vị / chức danh"><input className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Chuyên môn" help="Cách nhau bởi dấu phẩy — dùng cho gợi ý phản biện"><input className="input mt-1" value={f.expertise} onChange={(e) => setF({ ...f, expertise: e.target.value })} /></Field>
          <Field label="Hiệu lực đến"><input className="input mt-1" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          <ErrorBox error={create.error} />
          <button className="btn btn-primary" disabled={create.isPending}>Tạo tài khoản</button>
          {create.data && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              {create.data.temporaryPassword ? <>Mật khẩu tạm của <strong>{create.data.email}</strong>: <code className="select-all rounded bg-white px-1">{create.data.temporaryPassword}</code></> : null}
              <div className="text-xs">{create.data.note}</div>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

interface MailData {
  settings: { enabled: boolean; scope: 'all' | 'deadlines' };
  smtp: { configured: boolean; host: string | null; from: string | null };
  log: { id: string; to: string; subject: string; status: string; error: string | null; at: string; kind: string }[];
}

export function MailTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-mail'], queryFn: () => api<MailData>('/admin/mail') });
  const save = useMutation({ mutationFn: (b: MailData['settings']) => api('/admin/mail', { method: 'PUT', body: b }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-mail'] }) });
  const test = useMutation({ mutationFn: () => api<{ status: string; error?: string }>('/admin/mail/test', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-mail'] }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const STATUS: Record<string, string> = { SENT: '✓ Đã gửi', FAILED: '✕ Lỗi', NOT_CONFIGURED: '— Chưa cấu hình SMTP' };
  return (
    <div className="space-y-5">
      <Card title="Thư điện tử thông báo">
        <div className="space-y-3 text-sm">
          <p>
            Máy chủ thư: {d.smtp.configured ? <strong className="text-emerald-700">{d.smtp.host}</strong> : <strong className="text-amber-700">chưa cấu hình</strong>} · Người gửi: {d.smtp.from ?? '—'}
          </p>
          {!d.smtp.configured && <p className="rounded bg-amber-50 p-2 text-amber-900">Đặt biến môi trường <code>SMTP_URL</code> (smtp(s)://tài khoản:mật khẩu@máy chủ:cổng) và <code>MAIL_FROM</code> trên máy chủ API. Bản Local dùng máy chủ thư của trường; bản Online dùng dịch vụ gửi thư đã chọn. Khi chưa cấu hình, thông báo vẫn hiển thị trong ứng dụng.</p>}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.settings.enabled} onChange={(e) => save.mutate({ ...d.settings, enabled: e.target.checked })} /> Gửi thư kèm thông báo trong ứng dụng
          </label>
          <label className="flex items-center gap-2">
            Phạm vi
            <select className="input w-auto" value={d.settings.scope} onChange={(e) => save.mutate({ ...d.settings, scope: e.target.value as 'all' | 'deadlines' })}>
              <option value="all">Mọi thông báo (việc cần xử lý, kết quả duyệt, nhắc hạn)</option>
              <option value="deadlines">Chỉ nhắc hạn</option>
            </select>
          </label>
          <button className="btn" disabled={test.isPending} onClick={() => test.mutate()}>Gửi thư thử tới email quản trị</button>
          {test.data && <p>Kết quả: {STATUS[test.data.status] ?? test.data.status} {test.data.error}</p>}
          <ErrorBox error={save.error ?? test.error} />
        </div>
      </Card>
      <Card title="Nhật ký gửi thư (50 thư gần nhất)">
        {d.log.length === 0 ? <Empty>Chưa có thư.</Empty> : (
          <table className="table">
            <thead><tr><th>Thời điểm</th><th>Người nhận</th><th>Tiêu đề</th><th>Kết quả</th></tr></thead>
            <tbody>
              {d.log.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs">{fmtDateTime(l.at)}</td>
                  <td className="text-xs">{l.to}</td>
                  <td className="text-sm">{l.subject}</td>
                  <td className="text-xs">{STATUS[l.status] ?? l.status}{l.error && l.status === 'FAILED' ? ` — ${l.error}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
