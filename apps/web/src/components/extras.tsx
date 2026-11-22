import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, download, errorMessage } from '../lib/api';

export interface PersonRef {
  uid: string | null;
  name: string;
}

interface PersonHit {
  uid: string;
  displayName: string;
  unitName: string | null;
  title: string | null;
}

function usePeople(q: string) {
  return useQuery({
    queryKey: ['people', q],
    queryFn: () => api<{ items: PersonHit[] }>(`/people?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
}

/** Ô tìm một người trong trường; cho phép nhập tên người ngoài trường. */
export function PersonPicker({ value, onChange, allowExternal = true, placeholder = 'Tìm người trong trường (≥ 2 ký tự)…', label }: { value: PersonRef | null; onChange: (v: PersonRef | null) => void; allowExternal?: boolean; placeholder?: string; label?: string }) {
  const [q, setQ] = useState('');
  const s = usePeople(q);
  if (value)
    return (
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="rounded bg-brand-50 px-2 py-1 text-brand-800">
          {value.name}
          {!value.uid && <span className="text-xs text-slate-500"> (ngoài trường)</span>}
        </span>
        <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => onChange(null)}>
          Đổi
        </button>
      </div>
    );
  return (
    <div className="relative mt-1">
      <input className="input" aria-label={label} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {s.data?.items.map((p) => (
            <li key={p.uid}>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => (onChange({ uid: p.uid, name: p.displayName }), setQ(''))}>
                {p.displayName} <span className="text-slate-500">— {p.unitName ?? p.title}</span>
              </button>
            </li>
          ))}
          {allowExternal && (
            <li>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50" onClick={() => (onChange({ uid: null, name: q.trim() }), setQ(''))}>
                + Dùng “{q.trim()}” (người ngoài trường)
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function PeoplePicker({ value, onChange, allowExternal = true, label = 'Thêm người' }: { value: PersonRef[]; onChange: (v: PersonRef[]) => void; allowExternal?: boolean; label?: string }) {
  return (
    <div>
      <ul className="mt-1 flex flex-wrap gap-1">
        {value.map((v, i) => (
          <li key={i} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-sm">
            {v.name}
            {!v.uid && <span className="text-xs text-slate-500">(ngoài)</span>}
            <button type="button" aria-label={`Bỏ ${v.name}`} className="text-slate-500 hover:text-red-700" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <PersonPicker value={null} label={label} allowExternal={allowExternal} placeholder="Thêm người (≥ 2 ký tự)…" onChange={(p) => p && !value.some((x) => x.uid && x.uid === p.uid) && onChange([...value, p])} />
    </div>
  );
}

const fmtNum = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

/** Biểu đồ cột ngang (SVG thuần) — kèm số trên từng cột, đọc được khi in và với trình đọc màn hình. */
export function BarChart({ rows, label, value, title, max = 12 }: { rows: Record<string, string | number | null>[]; label: string; value: string; title?: string; max?: number }) {
  const data = rows.slice(0, max).map((r) => ({ l: String(r[label] ?? '—'), v: Number(r[value]) || 0 }));
  if (data.length === 0) return <p className="text-sm text-slate-500">Không có dữ liệu.</p>;
  const top = Math.max(...data.map((d) => d.v), 1);
  const rowH = 26;
  const labelW = 190;
  const W = 640;
  const barW = W - labelW - 70;
  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${data.length * rowH + 8}`} className="w-full min-w-[480px] max-w-2xl" role="img" aria-label={title ?? 'Biểu đồ'}>
        {data.map((d, i) => {
          const w = Math.max((d.v / top) * barW, d.v > 0 ? 2 : 0);
          const y = i * rowH + 4;
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + 15} textAnchor="end" className="fill-slate-700" fontSize="12">
                {d.l.length > 30 ? d.l.slice(0, 29) + '…' : d.l}
                <title>{d.l}</title>
              </text>
              <rect x={labelW} y={y + 3} width={w} height={rowH - 10} rx="3" className="fill-brand-600" />
              <text x={labelW + w + 6} y={y + 15} fontSize="12" className="fill-slate-900 font-medium">
                {fmtNum(d.v)}
              </text>
            </g>
          );
        })}
      </svg>
      {rows.length > max && <figcaption className="text-xs text-slate-500">Hiển thị {max}/{rows.length} dòng đầu.</figcaption>}
    </figure>
  );
}

export interface DataTableSpec {
  key: string;
  title: string;
  definition: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
  chart: { type: 'bar'; label: string; value: string } | null;
}

export function DataTable({ t }: { t: DataTableSpec }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {t.columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'text-right' : ''}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.length === 0 ? (
            <tr>
              <td colSpan={t.columns.length} className="text-center text-slate-500">
                Không có dữ liệu.
              </td>
            </tr>
          ) : (
            t.rows.map((r, i) => (
              <tr key={i}>
                {t.columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'text-right tabular-nums' : ''}>
                    {c.numeric && typeof r[c.key] === 'number' ? fmtNum(r[c.key] as number) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Nút tải tệp Word / Excel qua API có kiểm tra quyền. */
export function DownloadButton({ path, name, label, className = 'btn' }: { path: string; name: string; label: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await download(path, name);
          } catch (e) {
            setErr(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Đang tạo tệp…' : label}
      </button>
      {err ? <span className="text-xs text-red-700">{errorMessage(err)}</span> : null}
    </span>
  );
}

/** Tải tệp do POST tạo (vd. báo cáo Word từ dự thảo). */
export async function downloadPost(path: string, body: unknown, fallbackName: string) {
  const { getToken } = await import('../lib/auth');
  const { getTenant } = await import('../lib/api');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = await getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  const tenant = getTenant();
  if (tenant) h['X-Tenant-Id'] = tenant;
  const r = await fetch(`/api/v1${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!r.ok) {
    let msg = `Lỗi ${r.status}`;
    try {
      msg = ((await r.json()) as { message: string }).message;
    } catch {
      /* bỏ qua */
    }
    throw new Error(msg);
  }
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = m ? decodeURIComponent(m[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
