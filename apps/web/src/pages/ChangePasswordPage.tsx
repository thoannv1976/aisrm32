import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, ErrorBox, PageHeader } from '../components/ui';
import { changePassword, getPasswordPolicy } from '../lib/auth';
import { useSession } from '../lib/session';

/** Đổi mật khẩu (bản Local). forced: đang dùng mật khẩu tạm do quản trị cấp — chưa vào được hệ thống. */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { logout } = useSession();
  const nav = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (next !== again) return setError(new Error('Hai lần nhập mật khẩu mới không khớp.'));
    setBusy(true);
    try {
      await changePassword(cur, next);
      setDone(true);
      setCur('');
      setNext('');
      setAgain('');
      if (!forced) setTimeout(() => nav('/'), 1200);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {forced && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Bạn đang dùng mật khẩu tạm do quản trị cấp. Hãy đặt mật khẩu mới để tiếp tục.</p>}
      <label className="label">
        {forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}
        <input className="input mt-1" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
      </label>
      <label className="label">
        Mật khẩu mới
        <input className="input mt-1" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className="label">
        Nhập lại mật khẩu mới
        <input className="input mt-1" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      {getPasswordPolicy() && <p className="text-xs text-slate-500">Yêu cầu: {getPasswordPolicy()}</p>}
      {error ? <ErrorBox error={error} /> : null}
      {done && !forced && <p className="text-sm text-emerald-700">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
        {forced && (
          <button type="button" className="btn" onClick={() => logout()}>
            Đăng xuất
          </button>
        )}
      </div>
    </form>
  );

  if (forced)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow">
          <h1 className="mb-4 text-lg font-semibold">Đặt mật khẩu mới</h1>
          {form}
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Đổi mật khẩu" />
      <Card>
        <div className="max-w-md">{form}</div>
      </Card>
    </div>
  );
}
