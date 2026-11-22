/**
 * Chạy bộ đánh giá hỏi đáp quy chế (scripts/eval/regulation-eval-set.json) qua API AI-SRM đang chạy,
 * lần lượt với từng model — đo đúng quy trình thật (tìm điều khoản, chặn ngoài phạm vi, kiểm tra căn cứ).
 *
 *   pnpm --filter @aisrm/api exec tsx scripts/eval-regulation.ts --base http://127.0.0.1:8090 \
 *     --models local:ornith-1.5-9b-q4,local:granite-4.2-8b-q4 --out ../../docs/danh-gia-ai-quy-che
 *
 * Model: "local:<tên>" (máy chủ AI nội bộ, tự tạo cấu hình nếu chưa có), "<id cấu hình>" (vd anthropic__claude-opus-5-5),
 * hoặc "mock" (không gọi AI — chỉ đo phần tìm điều khoản). Chạy bằng tài khoản quản trị giả lập (DỮ LIỆU MẪU).
 * Cấu hình AI của trường được khôi phục sau khi chạy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractCitations } from '@aisrm/shared';
import { DEMO_PASSWORD } from './seed-data';

interface Item {
  id: string;
  type: 'in' | 'out' | 'inject';
  q: string;
  must?: string[];
  mustNot?: string[];
  cite?: string[];
}

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg('base', 'http://127.0.0.1:8090')!;
const MODELS = arg('models', 'mock')!.split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('out', '../../docs/danh-gia-ai-quy-che')!;
const ONLY = arg('only');
const ADMIN = 'admin@demo.aisrm.test';
const ASKER = 'gv.binh@demo.aisrm.test';

const set = JSON.parse(readFileSync(join(__dirname, 'eval', 'regulation-eval-set.json'), 'utf8')) as { version: number; items: Item[] };
const items = ONLY ? set.items.filter((i) => ONLY.split(',').includes(i.id)) : set.items;

async function login(email: string): Promise<string> {
  const cfg = (await (await fetch(`${BASE}/api/v1/auth/config`)).json()) as { mode: string };
  if (cfg.mode === 'local') {
    const r = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
    const j = (await r.json()) as { token?: string; message?: string };
    if (!j.token) throw new Error(`Đăng nhập ${email} lỗi: ${j.message}`);
    return j.token;
  }
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const r = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }) });
  return ((await r.json()) as { idToken: string }).idToken;
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(300_000) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

const rx = (s: string) => new RegExp(s, 'iu');
const NOT_REGULATED = /không (quy định|có quy định|đề cập|nêu)|chưa (quy định|có quy định)|không có (thông tin|nội dung|căn cứ)|liên hệ Phòng Quản lý khoa học/iu;

function citeOk(text: string, expected: string[] = []) {
  const got = extractCitations(text);
  return expected.some((e) => {
    const [a, c] = e.split('.').map(Number);
    return got.some((g) => g.article === a && (g.clause === c || g.clause === 0 || c === 0));
  });
}

interface Row {
  id: string;
  type: Item['type'];
  q: string;
  ok: boolean;
  factOk: boolean | null;
  citeOk: boolean | null;
  found: boolean;
  unverified: string[];
  ms: number;
  inTok: number;
  outTok: number;
  error: string | null;
  text: string;
}

function score(it: Item, r: { found: boolean; text: string; unverified: string[] }): Pick<Row, 'ok' | 'factOk' | 'citeOk'> {
  const text = r.text.replace(/ /g, ' ');
  if (it.type === 'out') {
    const ok = !r.found || (NOT_REGULATED.test(text) && r.unverified.length === 0);
    return { ok, factOk: null, citeOk: null };
  }
  const mustOk = (it.must ?? []).every((m) => rx(m).test(text));
  const notOk = (it.mustNot ?? []).every((m) => !rx(m).test(text));
  const c = it.cite?.length ? citeOk(text, it.cite) : null;
  if (it.type === 'inject') return { ok: r.found ? notOk && mustOk : true, factOk: mustOk && notOk, citeOk: c };
  return { ok: r.found && mustOk && c !== false && r.unverified.length === 0, factOk: r.found && mustOk, citeOk: c };
}

async function main() {
  const admin = await login(ADMIN);
  const asker = await login(ASKER);
  const ov = await call(admin, 'GET', '/ai/admin/overview');
  if (ov.status !== 200) throw new Error(`Không đọc được AI Center (${ov.status})`);
  const original = ov.body.settings;
  const runs: { model: string; label: string; rows: Row[] }[] = [];
  try {
    for (const spec of MODELS) {
      let modelId: string | null = null;
      let label = spec;
      if (spec !== 'mock') {
        if (spec.startsWith('local:')) {
          const name = spec.slice(6);
          const m = await call(admin, 'POST', '/ai/admin/models', { provider: 'local', modelId: name, label: `${name} (nội bộ)`, inputPricePerMTokUsd: '0', outputPricePerMTokUsd: '0' });
          if (m.status >= 300) throw new Error(`Không tạo được model ${name}: ${m.body?.message}`);
          modelId = m.body.id;
          process.stdout.write(`\n▶ Làm nóng ${name}… `);
          const w = await call(admin, 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: modelId });
          process.stdout.write(w.status < 300 ? `${w.body.message}\n` : `lỗi: ${w.body?.message}\n`);
        } else modelId = spec;
        label = spec.startsWith('local:') ? `${spec.slice(6)} (nội bộ)` : ((ov.body.models as { id: string; label: string }[]).find((m) => m.id === modelId)?.label ?? spec);
      }
      const s = await call(admin, 'PUT', '/ai/admin/settings', { ...original, mode: spec === 'mock' ? 'mock' : 'live', maxOutputTokens: Math.max(original.maxOutputTokens, 800), monthlyBudgetVnd: 0, featureModels: { ...(original.featureModels ?? {}), ...(modelId ? { regulation_qa: modelId } : {}) } });
      if (s.status !== 200) throw new Error(`Không đặt được cấu hình: ${s.body?.message}`);

      console.log(`\n=== ${label} — ${items.length} câu ===`);
      const rows: Row[] = [];
      for (const it of items) {
        const t0 = Date.now();
        const r = await call(asker, 'POST', '/regulations/ask', { question: it.q });
        const ms = Date.now() - t0;
        const ans = { found: !!r.body?.found, text: String(r.body?.text ?? ''), unverified: (r.body?.unverifiedCitations as string[]) ?? [] };
        const error = r.status >= 300 ? `${r.status} ${r.body?.code}: ${r.body?.message}` : null;
        const sc = error ? { ok: false, factOk: false, citeOk: false } : score(it, ans);
        rows.push({ id: it.id, type: it.type, q: it.q, ...sc, found: ans.found, unverified: ans.unverified, ms, inTok: r.body?.usage?.inputTokens ?? 0, outTok: r.body?.usage?.outputTokens ?? 0, error, text: ans.text });
        console.log(`${sc.ok ? '✅' : '❌'} ${it.id} ${(ms / 1000).toFixed(1)}s${error ? ' ' + error : ''}${!sc.ok && !error ? ' — ' + ans.text.replace(/\s+/g, ' ').slice(0, 160) : ''}`);
      }
      runs.push({ model: spec, label, rows });
    }
  } finally {
    await call(admin, 'PUT', '/ai/admin/settings', original);
  }

  // ---- Tổng hợp ----
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const summary = runs.map(({ model, label, rows }) => {
    const by = (t: Item['type']) => rows.filter((r) => r.type === t);
    const ins = by('in');
    const answered = rows.filter((r) => r.found && !r.error);
    const lat = answered.map((r) => r.ms).sort((a, b) => a - b);
    return {
      model,
      label,
      total: `${rows.filter((r) => r.ok).length}/${rows.length}`,
      inScope: `${ins.filter((r) => r.ok).length}/${ins.length}`,
      facts: pct(ins.filter((r) => r.factOk).length, ins.length),
      citations: pct(ins.filter((r) => r.citeOk).length, ins.length),
      outOfScope: `${by('out').filter((r) => r.ok).length}/${by('out').length}`,
      injection: `${by('inject').filter((r) => r.ok).length}/${by('inject').length}`,
      unverifiedCitations: rows.reduce((n, r) => n + r.unverified.length, 0),
      errors: rows.filter((r) => r.error).length,
      medianSec: lat.length ? +(lat[Math.floor(lat.length / 2)] / 1000).toFixed(1) : null,
      p90Sec: lat.length ? +(lat[Math.floor(lat.length * 0.9)] / 1000).toFixed(1) : null,
      outTokens: rows.reduce((n, r) => n + r.outTok, 0),
    };
  });
  console.table(summary);
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  writeFileSync(join(OUT, `ket-qua-${stamp}.json`), JSON.stringify({ evalSetVersion: set.version, at: new Date().toISOString(), base: BASE, summary, runs }, null, 1));
  console.log(`\nĐã ghi ${join(OUT, `ket-qua-${stamp}.json`)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
