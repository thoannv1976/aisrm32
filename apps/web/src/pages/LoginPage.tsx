import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { ErrorBox } from '../components/ui';
import { auth, usingEmulators } from '../lib/firebase';

/** Tài khoản giả lập trong emulator (xem apps/api/scripts/seed-data.ts). Chỉ hiện khi chạy với emulator. */
const DEMO_ACCOUNTS = [
  ['gv.binh@demo.aisrm.test', 'Giảng viên / chủ nhiệm đề tài'],
  ['dm.ktqt@demo.aisrm.test', 'Đầu mối KH Khoa KTQT'],
  ['dm.qtkd@demo.aisrm.test', 'Đầu mối KH Khoa QTKD'],
  ['cv.linh@demo.aisrm.test', 'Chuyên viên Phòng QLKH'],
  ['tp.hung@demo.aisrm.test', 'Trưởng phòng QLKH'],
  ['pht.nam@demo.aisrm.test', 'Phó Hiệu trưởng'],
  ['ht.quang@demo.aisrm.test', 'Hiệu trưởng'],
  ['sv.an@demo.aisrm.test', 'Sinh viên'],
  ['admin@demo.aisrm.test', 'Quản trị hệ thống'],
  ['gv.xuan@demo2.aisrm.test', 'Giảng viên — Trường 2'],
] as const;
const DEMO_PASSWORD = 'Demo@12345';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const login = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, e, p);
    } catch {
      setError(new Error('Email hoặc mật khẩu không đúng.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl md:grid-cols-2">
        <div className="bg-brand-800 p-8 text-white">
          <img src="/favicon.svg" alt="" className="mb-4 h-12 w-12" />
          <h1 className="text-2xl font-semibold">AI-SRM</h1>
          <p className="mt-1 text-white/80">Hệ thống quản lý khoa học và đổi mới sáng tạo tích hợp trí tuệ nhân tạo</p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li>• Đăng ký, xét duyệt đề tài theo quy trình số</li>
            <li>• Theo dõi tiến độ, nghiệm thu, sản phẩm</li>
            <li>• Xác nhận công bố, hồ sơ nhà khoa học</li>
            <li>• Dashboard điều hành theo vai trò</li>
          </ul>
        </div>
        <div className="p-8">
          <h2 className="text-lg font-semibold">Đăng nhập</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void login(email, password);
            }}
          >
            <label className="label">
              Email
              <input className="input mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="label">
              Mật khẩu
              <input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error ? <ErrorBox error={error} /> : null}
            <button className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
            <p className="text-xs text-slate-500">Đăng nhập một lần (SSO) của trường sẽ được kết nối khi có cấu hình định danh chính thức.</p>
          </form>

          {usingEmulators && (
            <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-900">Môi trường thử (emulator) — tài khoản giả lập</div>
              <div className="mt-2 grid gap-1">
                {DEMO_ACCOUNTS.map(([e, label]) => (
                  <button key={e} className="rounded px-2 py-1 text-left text-xs hover:bg-amber-100" onClick={() => login(e, DEMO_PASSWORD)} disabled={busy}>
                    <span className="font-medium">{label}</span> <span className="text-amber-800/70">— {e}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
