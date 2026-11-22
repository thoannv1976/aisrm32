import {
  AI_FEATURE_LABELS,
  AI_PROVIDER_LABELS,
  microsToUsd,
  type AiModelConfig,
  type AiProvider,
  type AiProviderStatus,
  type AiSettings,
  type AiUsageRecord,
} from '@aisrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Card, Empty, ErrorBox, Field, fmtDateTime, fmtVnd, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';

interface Overview {
  providers: AiProviderStatus[];
  models: AiModelConfig[];
  settings: AiSettings;
  spend: { month: string; costVnd: number; calls: number; unpricedCalls: number; inputTokens: number; outputTokens: number };
  storage: string;
  localAi: { configured: boolean; host: string | null; concurrency: number; queueMax: number; timeoutSec: number; reasoning: boolean; queue: { active: number; waiting: number } };
}

const fmtInt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
const usd = (m: number | null) => (m === null ? 'chưa có giá' : `$${microsToUsd(m)}`);

function useOverview() {
  return useQuery({ queryKey: ['ai-overview'], queryFn: () => api<Overview>('/ai/admin/overview') });
}

function ProviderCard({ s, o }: { s: AiProviderStatus; o: Overview }) {
  if (s.provider === 'local') return <LocalProviderCard s={s} o={o} />;
  return <CloudProviderCard s={s} />;
}

/** Máy chủ AI nội bộ: địa chỉ do người cài đặt cấu hình (biến môi trường), không nhập từ giao diện. */
function LocalProviderCard({ s, o }: { s: AiProviderStatus; o: Overview }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-overview'] });
  const test = useMutation({ mutationFn: () => api(`/ai/admin/providers/local/test`, { method: 'POST' }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api(`/ai/admin/providers/local`, { method: 'PUT', body: { enabled } }), onSuccess: refresh });
  const localModels = o.models.filter((m) => m.provider === 'local');
  const [warmId, setWarmId] = useState('');
  const warm = useMutation({ mutationFn: () => api<{ message: string }>(`/ai/admin/providers/local/warmup`, { method: 'POST', body: { modelConfigId: warmId || localModels[0]?.id } }) });
  const l = o.localAi;
  return (
    <Card
      title={AI_PROVIDER_LABELS.local}
      actions={
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={s.enabled} onChange={(e) => toggle.mutate(e.target.checked)} /> Bật
        </label>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {l.configured ? <StatusBadge status="APPROVED" label={`Máy chủ: ${l.host}`} /> : <StatusBadge status="DRAFT" label="Chưa cấu hình" />}
        {s.lastTest && <StatusBadge status={s.lastTest.ok ? 'ACTIVE' : 'REJECTED'} label={s.lastTest.ok ? 'Kết nối OK' : 'Kết nối lỗi'} />}
      </div>
      <p className="mb-2 text-xs text-slate-600">
        {l.configured
          ? `Xử lý đồng thời ${l.concurrency} · hàng chờ tối đa ${l.queueMax} · chờ tối đa ${l.timeoutSec} giây · suy luận ${l.reasoning ? 'bật' : 'tắt'} · đang xử lý ${l.queue.active}, đang chờ ${l.queue.waiting}. Chi phí 0 ₫ (vẫn ghi số lượt và token).`
          : 'Người cài đặt đặt biến LOCAL_AI_BASE_URL (vd. http://ollama:11434 hoặc http://localai:8080) để dùng AI ngay trên máy chủ của trường — dữ liệu không ra ngoài.'}
      </p>
      {s.lastTest && <p className="mb-2 text-xs text-slate-600">{s.lastTest.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn text-xs" disabled={!l.configured || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
        </button>
        {localModels.length > 0 && (
          <>
            <select className="input w-auto py-1 text-xs" aria-label="Model cần làm nóng" value={warmId} onChange={(e) => setWarmId(e.target.value)}>
              {localModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button className="btn text-xs" disabled={!l.configured || warm.isPending} onClick={() => warm.mutate()}>
              {warm.isPending ? 'Đang nạp model vào GPU…' : 'Làm nóng'}
            </button>
          </>
        )}
      </div>
      {warm.data && <p className="mt-2 text-xs text-emerald-700">{warm.data.message}</p>}
      <ErrorBox error={test.error ?? warm.error ?? toggle.error} />
    </Card>
  );
}

function CloudProviderCard({ s }: { s: AiProviderStatus }) {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-overview'] });
  const save = useMutation({ mutationFn: () => api(`/ai/admin/providers/${s.provider}/key`, { method: 'PUT', body: { apiKey: key } }), onSuccess: () => (setKey(''), refresh()) });
  const remove = useMutation({ mutationFn: () => api(`/ai/admin/providers/${s.provider}/key`, { method: 'DELETE' }), onSuccess: refresh });
  const test = useMutation({ mutationFn: () => api(`/ai/admin/providers/${s.provider}/test`, { method: 'POST' }), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api(`/ai/admin/providers/${s.provider}`, { method: 'PUT', body: { enabled } }), onSuccess: refresh });
  const placeholder = s.provider === 'anthropic' ? 'sk-ant-…' : s.provider === 'openai' ? 'sk-…' : 'AIza…';
  return (
    <Card
      title={AI_PROVIDER_LABELS[s.provider]}
      actions={
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={s.enabled} onChange={(e) => toggle.mutate(e.target.checked)} /> Bật
        </label>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {s.keyStatus === 'SET' ? <StatusBadge status="APPROVED" label={`Đã nạp khóa ${s.keyHint ?? ''}`} /> : <StatusBadge status="DRAFT" label="Chưa có khóa" />}
        {s.lastTest && <StatusBadge status={s.lastTest.ok ? 'ACTIVE' : 'REJECTED'} label={s.lastTest.ok ? 'Kết nối OK' : 'Kết nối lỗi'} />}
      </div>
      {s.keyUpdatedAt && (
        <p className="mb-2 text-xs text-slate-500">
          Cập nhật: {fmtDateTime(s.keyUpdatedAt)} · {s.keyUpdatedByName}
        </p>
      )}
      {s.lastTest && <p className="mb-2 text-xs text-slate-600">{s.lastTest.message}</p>}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <input
          className="input min-w-0 flex-1"
          type="password"
          autoComplete="off"
          placeholder={s.keyStatus === 'SET' ? 'Nhập khóa mới để thay thế' : `Dán khóa API (${placeholder})`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label={`Khóa API ${AI_PROVIDER_LABELS[s.provider]}`}
        />
        <button className="btn btn-primary" disabled={!key.trim() || save.isPending}>
          Lưu khóa
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn text-xs" disabled={s.keyStatus !== 'SET' || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
        </button>
        {s.keyStatus === 'SET' && (
          <button className="btn btn-danger text-xs" onClick={() => confirm('Xóa khóa API của nhà cung cấp này?') && remove.mutate()}>
            Xóa khóa
          </button>
        )}
      </div>
      <ErrorBox error={save.error ?? test.error ?? remove.error} />
    </Card>
  );
}

function ProvidersTab({ o }: { o: Overview }) {
  return (
    <>
      <p className="mb-4 rounded-md bg-sky-50 p-3 text-sm text-sky-900">
        Khóa API do nhà trường đăng ký với nhà cung cấp và tự chi trả theo mức sử dụng. Khóa được lưu tại <strong>{o.storage}</strong>, không hiển thị lại, không gửi xuống trình duyệt và không ghi vào nhật ký.
        "Kiểm tra kết nối" chỉ lấy danh sách model, không tốn token.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {o.providers.map((s) => (
          <ProviderCard o={o} key={s.provider} s={s} />
        ))}
      </div>
    </>
  );
}

function ModelsTab({ o }: { o: Overview }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-overview'] });
  const empty = { provider: 'anthropic' as AiProvider, modelId: '', label: '', inputPricePerMTokUsd: '', outputPricePerMTokUsd: '', priceEffectiveDate: new Date().toISOString().slice(0, 10), priceSource: '' };
  const [f, setF] = useState(empty);
  const save = useMutation({ mutationFn: () => api('/ai/admin/models', { method: 'POST', body: { ...f, priceSource: f.priceSource || null } }), onSuccess: () => (setF(empty), refresh()) });
  const toggle = useMutation({ mutationFn: (m: AiModelConfig) => api(`/ai/admin/models/${m.id}`, { method: 'PATCH', body: { enabled: !m.enabled } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api(`/ai/admin/models/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const suggestions = o.providers.find((p) => p.provider === f.provider)?.availableModels ?? [];
  return (
    <div className="space-y-5">
      <Card title="Model và bảng giá (USD / 1 triệu token)">
        {o.models.length === 0 ? (
          <Empty>Chưa cấu hình model.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Nhà cung cấp</th>
                  <th>Model</th>
                  <th className="text-right">Giá vào</th>
                  <th className="text-right">Giá ra</th>
                  <th>Hiệu lực / nguồn giá</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {o.models.map((m) => (
                  <tr key={m.id}>
                    <td>{AI_PROVIDER_LABELS[m.provider]}</td>
                    <td>
                      <div className="font-medium">{m.label}</div>
                      <div className="font-mono text-xs text-slate-500">{m.modelId}</div>
                      {o.settings.defaultModelId === m.id && <span className="text-xs text-brand-700">★ Mặc định</span>}
                    </td>
                    <td className="text-right tabular-nums">{usd(m.inputPriceMicrosPerMTok)}</td>
                    <td className="text-right tabular-nums">{usd(m.outputPriceMicrosPerMTok)}</td>
                    <td className="text-xs text-slate-600">
                      {m.priceEffectiveDate ?? '—'}
                      <div>{m.priceSource}</div>
                    </td>
                    <td>
                      <StatusBadge status={m.enabled ? 'ACTIVE' : 'ARCHIVED'} label={m.enabled ? 'Đang bật' : 'Tắt'} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="text-xs text-brand-600 hover:underline" onClick={() => setF({ provider: m.provider, modelId: m.modelId, label: m.label, inputPricePerMTokUsd: microsToUsd(m.inputPriceMicrosPerMTok), outputPricePerMTokUsd: microsToUsd(m.outputPriceMicrosPerMTok), priceEffectiveDate: m.priceEffectiveDate ?? '', priceSource: m.priceSource ?? '' })}>
                        Sửa
                      </button>{' '}
                      <button className="text-xs text-slate-600 hover:underline" onClick={() => toggle.mutate(m)}>
                        {m.enabled ? 'Tắt' : 'Bật'}
                      </button>{' '}
                      <button className="text-xs text-red-700 hover:underline" onClick={() => confirm(`Xóa model ${m.modelId}?`) && del.mutate(m.id)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={toggle.error ?? del.error} />
      </Card>
      <Card title="Thêm / cập nhật model">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Nhà cung cấp" required>
            <select className="input mt-1" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as AiProvider })}>
              {Object.entries(AI_PROVIDER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã model" required help={suggestions.length ? `${suggestions.length} model lấy từ lần kiểm tra kết nối gần nhất` : 'Kiểm tra kết nối để lấy danh sách model'}>
            <input className="input mt-1 font-mono" list={`models-${f.provider}`} required value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value.trim() })} />
            <datalist id={`models-${f.provider}`}>
              {suggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Tên hiển thị">
            <input className="input mt-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          </Field>
          <Field label="Giá đầu vào (USD / 1M token)" help="Để trống nếu chưa rõ — chi phí sẽ hiển thị “chưa xác định”">
            <input className="input mt-1" inputMode="decimal" value={f.inputPricePerMTokUsd} onChange={(e) => setF({ ...f, inputPricePerMTokUsd: e.target.value })} />
          </Field>
          <Field label="Giá đầu ra (USD / 1M token)">
            <input className="input mt-1" inputMode="decimal" value={f.outputPricePerMTokUsd} onChange={(e) => setF({ ...f, outputPricePerMTokUsd: e.target.value })} />
          </Field>
          <Field label="Ngày hiệu lực giá">
            <input className="input mt-1" type="date" value={f.priceEffectiveDate} onChange={(e) => setF({ ...f, priceEffectiveDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Nguồn giá" help="Ghi rõ trang bảng giá của nhà cung cấp và ngày kiểm tra">
              <input className="input mt-1" value={f.priceSource} onChange={(e) => setF({ ...f, priceSource: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <ErrorBox error={save.error} />
            <button className="btn btn-primary mt-2" disabled={save.isPending}>
              Lưu model
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SettingsTab({ o }: { o: Overview }) {
  const qc = useQueryClient();
  const [s, setS] = useState<AiSettings>(o.settings);
  useEffect(() => setS(o.settings), [o.settings]);
  const save = useMutation({ mutationFn: () => api('/ai/admin/settings', { method: 'PUT', body: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-overview'] }) });
  return (
    <Card title="Chế độ, tỷ giá, ngân sách và kiểm soát">
      <form
        className="grid max-w-3xl gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Chế độ chạy" required help="Giả lập: không gọi nhà cung cấp, không phát sinh chi phí. Thật: dùng khóa API của trường.">
          <select className="input mt-1" value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as AiSettings['mode'] })}>
            <option value="mock">Giả lập (mock)</option>
            <option value="live">Thật (live)</option>
          </select>
        </Field>
        <Field label="Model mặc định">
          <select className="input mt-1" value={s.defaultModelId ?? ''} onChange={(e) => setS({ ...s, defaultModelId: e.target.value || null })}>
            <option value="">— Chưa chọn —</option>
            {o.models
              .filter((m) => m.enabled)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({AI_PROVIDER_LABELS[m.provider]})
                </option>
              ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <div className="text-sm font-medium text-slate-700">Model theo chức năng</div>
          <p className="text-xs text-slate-500">Ví dụ: hỏi đáp quy chế dùng máy chủ AI nội bộ (dữ liệu không ra ngoài), chức năng khác dùng model mặc định.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(AI_FEATURE_LABELS)
              .filter(([k]) => k !== 'playground')
              .map(([k, label]) => (
                <label key={k} className="text-xs text-slate-600">
                  {label}
                  <select
                    className="input mt-1"
                    value={s.featureModels?.[k] ?? ''}
                    onChange={(e) => {
                      const fm = { ...(s.featureModels ?? {}) };
                      if (e.target.value) fm[k] = e.target.value;
                      else delete fm[k];
                      setS({ ...s, featureModels: fm });
                    }}
                  >
                    <option value="">Theo model mặc định</option>
                    {o.models
                      .filter((m) => m.enabled)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({AI_PROVIDER_LABELS[m.provider]})
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </div>
        </div>
        <Field label="Tỷ giá (VND / 1 USD)" required help="Dùng để quy đổi chi phí; cập nhật theo tỷ giá thanh toán thực tế của trường">
          <input className="input mt-1" type="number" min={1000} value={s.usdToVnd} onChange={(e) => setS({ ...s, usdToVnd: Number(e.target.value) })} />
        </Field>
        <Field label="Ngày tỷ giá">
          <input className="input mt-1" type="date" value={s.usdToVndDate ?? ''} onChange={(e) => setS({ ...s, usdToVndDate: e.target.value || null })} />
        </Field>
        <Field label="Ngân sách AI mỗi tháng (VND)" help="0 = không giới hạn">
          <input className="input mt-1" type="number" min={0} step={10000} value={s.monthlyBudgetVnd} onChange={(e) => setS({ ...s, monthlyBudgetVnd: Number(e.target.value) })} />
        </Field>
        <Field label="Giới hạn token đầu ra mỗi lượt">
          <input className="input mt-1" type="number" min={64} max={16000} value={s.maxOutputTokens} onChange={(e) => setS({ ...s, maxOutputTokens: Number(e.target.value) })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.hardStop} onChange={(e) => setS({ ...s, hardStop: e.target.checked })} />
          Dừng gọi AI khi vượt ngân sách tháng
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-red-800">
          <input type="checkbox" checked={s.killSwitch} onChange={(e) => setS({ ...s, killSwitch: e.target.checked })} />
          Tắt toàn bộ AI (khẩn cấp)
        </label>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
          {save.isSuccess && <p className="text-sm text-emerald-700">✓ Đã lưu cấu hình.</p>}
          <button className="btn btn-primary mt-2" disabled={save.isPending}>
            Lưu cấu hình
          </button>
        </div>
      </form>
    </Card>
  );
}

interface Group {
  key: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costVnd: number;
  unpriced: number;
}
interface UsageReport {
  month: string;
  budgetVnd: number;
  spend: Overview['spend'];
  byModel: Group[];
  byFeature: Group[];
  byUser: Group[];
  byDay: Group[];
  blocked: number;
  recent: AiUsageRecord[];
}

const FEATURE_LABELS = AI_FEATURE_LABELS;

function GroupTable({ title, rows, labels }: { title: string; rows: Group[]; labels?: Record<string, string> }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <Empty>Chưa có dữ liệu.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nhóm</th>
                <th className="text-right">Lượt</th>
                <th className="text-right">Token vào</th>
                <th className="text-right">Token ra</th>
                <th className="text-right">Chi phí</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key}>
                  <td>
                    {labels?.[g.key] ?? g.key}
                    {g.errors > 0 && <span className="ml-1 text-xs text-red-700">({g.errors} lỗi)</span>}
                  </td>
                  <td className="text-right tabular-nums">{fmtInt(g.calls)}</td>
                  <td className="text-right tabular-nums">{fmtInt(g.inputTokens)}</td>
                  <td className="text-right tabular-nums">{fmtInt(g.outputTokens)}</td>
                  <td className="text-right tabular-nums">
                    {fmtVnd(g.costVnd)}
                    {g.unpriced > 0 && <div className="text-xs text-amber-700">+{g.unpriced} lượt chưa có giá</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UsageTab() {
  const [month, setMonth] = useState(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7));
  const q = useQuery({ queryKey: ['ai-usage', month], queryFn: () => api<UsageReport>(`/ai/admin/usage?month=${month}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const r = q.data!;
  const pct = r.budgetVnd > 0 ? Math.min(100, Math.round((r.spend.costVnd / r.budgetVnd) * 100)) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="label">
          Tháng
          <input className="input mt-1" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-3">
          <div className="text-xs text-slate-500">Chi phí tháng (thực tế)</div>
          <div className="text-xl font-semibold text-brand-800">{fmtVnd(r.spend.costVnd)}</div>
          {pct !== null && (
            <div className="mt-2">
              <div className="h-2 rounded bg-slate-100" aria-hidden>
                <div className={`h-2 rounded ${pct >= 90 ? 'bg-red-600' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {pct}% ngân sách {fmtVnd(r.budgetVnd)}
              </div>
            </div>
          )}
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">Lượt gọi</div>
          <div className="text-xl font-semibold text-brand-800">{fmtInt(r.spend.calls)}</div>
          <div className="text-xs text-slate-500">{r.blocked} lượt bị chặn do hạn mức</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">Token vào / ra</div>
          <div className="text-xl font-semibold text-brand-800">
            {fmtInt(r.spend.inputTokens)} / {fmtInt(r.spend.outputTokens)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-slate-500">Lượt chưa có giá</div>
          <div className={`text-xl font-semibold ${r.spend.unpricedCalls ? 'text-amber-700' : 'text-brand-800'}`}>{fmtInt(r.spend.unpricedCalls)}</div>
          <div className="text-xs text-slate-500">Cần cấu hình giá để tính đủ chi phí</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Chi phí tính từ số token thực tế nhà cung cấp trả về × bảng giá đã cấu hình × tỷ giá; đối chiếu với hóa đơn của nhà cung cấp khi quyết toán. Lượt chạy giả lập không tính chi phí.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        <GroupTable title="Theo model" rows={r.byModel} />
        <GroupTable title="Theo chức năng" rows={r.byFeature} labels={FEATURE_LABELS} />
        <GroupTable title="Theo người dùng" rows={r.byUser} />
        <GroupTable title="Theo ngày" rows={r.byDay} />
      </div>
      <Card title="Lượt gọi gần đây (không lưu nội dung)">
        {r.recent.length === 0 ? (
          <Empty>Chưa có lượt gọi.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người dùng</th>
                  <th>Chức năng</th>
                  <th>Model</th>
                  <th className="text-right">Token</th>
                  <th className="text-right">Chi phí</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {r.recent.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(u.at)}</td>
                    <td>{u.userName}</td>
                    <td>{FEATURE_LABELS[u.feature] ?? u.feature}</td>
                    <td className="font-mono text-xs">
                      {u.provider}/{u.modelId}
                    </td>
                    <td className="text-right tabular-nums">
                      {fmtInt(u.inputTokens)}+{fmtInt(u.outputTokens)}
                    </td>
                    <td className="text-right tabular-nums">{u.mock ? 'giả lập' : u.priceKnown ? fmtVnd(u.costVnd) : 'chưa xác định'}</td>
                    <td>
                      <StatusBadge status={u.status === 'SUCCESS' ? 'APPROVED' : 'REJECTED'} label={u.status === 'SUCCESS' ? 'OK' : u.status === 'BLOCKED' ? 'Bị chặn' : `Lỗi ${u.errorCode ?? ''}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CalculatorTab({ o }: { o: Overview }) {
  const [f, setF] = useState({ modelConfigId: o.settings.defaultModelId ?? o.models[0]?.id ?? '', inputTokens: 3000, outputTokens: 800, calls: 500 });
  const m = useMutation({ mutationFn: () => api<{ perCall: { priceKnown: boolean; costUsdMicros: number | null; costVnd: number | null }; total: { costUsdMicros: number; costVnd: number } | null; usdToVnd: number }>('/ai/estimate', { method: 'POST', body: f }) });
  return (
    <Card title="Máy tính chi phí AI">
      <form
        className="grid max-w-3xl gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Model" required>
          <select className="input mt-1" value={f.modelConfigId} onChange={(e) => setF({ ...f, modelConfigId: e.target.value })}>
            {o.models.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} — {usd(x.inputPriceMicrosPerMTok)} / {usd(x.outputPriceMicrosPerMTok)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số lượt dự kiến" help="vd: số hồ sơ cần tóm tắt trong một đợt">
          <input className="input mt-1" type="number" min={1} value={f.calls} onChange={(e) => setF({ ...f, calls: Number(e.target.value) })} />
        </Field>
        <Field label="Token đầu vào mỗi lượt" help="~1 trang A4 tiếng Việt ≈ 700–1.000 token">
          <input className="input mt-1" type="number" min={0} value={f.inputTokens} onChange={(e) => setF({ ...f, inputTokens: Number(e.target.value) })} />
        </Field>
        <Field label="Token đầu ra mỗi lượt">
          <input className="input mt-1" type="number" min={0} value={f.outputTokens} onChange={(e) => setF({ ...f, outputTokens: Number(e.target.value) })} />
        </Field>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" disabled={!f.modelConfigId || m.isPending}>
            Tính chi phí
          </button>
        </div>
      </form>
      <ErrorBox error={m.error} />
      {m.data &&
        (m.data.perCall.priceKnown ? (
          <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Mỗi lượt</div>
              <div className="text-lg font-semibold">{fmtVnd(m.data.perCall.costVnd)}</div>
              <div className="text-xs text-slate-500">${microsToUsd(m.data.perCall.costUsdMicros)}</div>
            </div>
            <div className="rounded-md bg-brand-50 p-3">
              <div className="text-xs text-slate-500">Tổng {fmtInt(f.calls)} lượt</div>
              <div className="text-lg font-semibold text-brand-800">{fmtVnd(m.data.total!.costVnd)}</div>
              <div className="text-xs text-slate-500">
                ${microsToUsd(m.data.total!.costUsdMicros)} · tỷ giá {fmtInt(m.data.usdToVnd)} ₫/USD
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-amber-800">Model này chưa có giá — chi phí chưa xác định. Hãy nhập giá ở tab Model & bảng giá.</p>
        ))}
    </Card>
  );
}

function PlaygroundTab({ o }: { o: Overview }) {
  const [modelConfigId, setModel] = useState(o.settings.defaultModelId ?? o.models[0]?.id ?? '');
  const [prompt, setPrompt] = useState('Liệt kê 3 tiêu chí chính khi xét duyệt một đề tài nghiên cứu khoa học cấp trường.');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      api<{ text: string; usage: AiUsageRecord; estimatedIfLive: { priceKnown: boolean; costVnd: number | null } | null; fallbackUsed: boolean }>('/ai/admin/playground', {
        method: 'POST',
        body: { modelConfigId, prompt, maxOutputTokens: 500 },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-usage'] }),
  });
  return (
    <Card title="Chạy thử model">
      <p className="mb-3 text-sm text-slate-600">
        Chế độ hiện tại: <strong>{o.settings.mode === 'mock' ? 'Giả lập — không tốn phí' : 'Thật — có phát sinh chi phí'}</strong>. Mỗi lượt được ghi vào báo cáo sử dụng (chỉ số token, không lưu nội dung). Không nhập dữ liệu cá nhân hay dữ liệu mật.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <select className="input max-w-md" value={modelConfigId} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {o.models
            .filter((x) => x.enabled)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} ({AI_PROVIDER_LABELS[x.provider]})
              </option>
            ))}
        </select>
        <textarea className="input" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={20000} aria-label="Nội dung" />
        <button className="btn btn-primary" disabled={!modelConfigId || !prompt.trim() || m.isPending}>
          {m.isPending ? 'Đang chạy…' : 'Chạy thử'}
        </button>
      </form>
      <ErrorBox error={m.error} />
      {m.data && (
        <div className="mt-4 space-y-2">
          <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{m.data.text}</pre>
          <p className="text-xs text-slate-600">
            Token: {fmtInt(m.data.usage.inputTokens)} vào + {fmtInt(m.data.usage.outputTokens)} ra · {m.data.usage.latencyMs} ms ·{' '}
            {m.data.usage.mock
              ? `Giả lập; nếu chạy thật ước tính ${m.data.estimatedIfLive?.priceKnown ? fmtVnd(m.data.estimatedIfLive.costVnd) : 'chưa xác định (thiếu giá)'}`
              : m.data.usage.priceKnown
                ? `Chi phí ${fmtVnd(m.data.usage.costVnd)}`
                : 'Chi phí chưa xác định (model chưa có giá)'}
            {m.data.fallbackUsed && ' · Nhà cung cấp đã chuyển sang model dự phòng'}
          </p>
        </div>
      )}
    </Card>
  );
}

export function AiCenterPage() {
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ enabled: boolean; mode: string; isAdmin: boolean }>('/ai/status') });
  const o = useOverview();
  const [tab, setTab] = useState<'providers' | 'models' | 'settings' | 'usage' | 'calc' | 'play'>('providers');
  if (status.isLoading) return <Loading />;
  if (!status.data?.isAdmin) {
    return (
      <>
        <PageHeader title="AI Center" subtitle="Trợ lý AI hỗ trợ nghiệp vụ khoa học" />
        <Card>
          <p className="text-sm text-slate-700">
            Trạng thái AI của trường: <strong>{status.data?.enabled ? `đang bật (${status.data.mode === 'mock' ? 'giả lập' : 'thật'})` : 'chưa bật'}</strong>. Các chức năng AI xuất hiện ngay trong hồ sơ đề xuất, công bố
            và báo cáo khi được bật. AI chỉ tạo dự thảo — người có thẩm quyền kiểm tra và quyết định.
          </p>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="AI Center"
        subtitle={
          o.data ? (
            <>
              Chế độ: <strong>{o.data.settings.mode === 'mock' ? 'Giả lập' : 'Thật'}</strong> · Chi phí tháng {o.data.spend.month}: <strong>{fmtVnd(o.data.spend.costVnd)}</strong>
              {o.data.settings.monthlyBudgetVnd > 0 && <> / {fmtVnd(o.data.settings.monthlyBudgetVnd)}</>}
              {o.data.settings.killSwitch && <span className="ml-2 font-semibold text-red-700">· AI ĐANG TẮT KHẨN CẤP</span>}
            </>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'providers', label: 'Nhà cung cấp & khóa API' },
          { key: 'models', label: 'Model & bảng giá' },
          { key: 'settings', label: 'Cấu hình & hạn mức' },
          { key: 'usage', label: 'Sử dụng & chi phí' },
          { key: 'calc', label: 'Máy tính chi phí' },
          { key: 'play', label: 'Chạy thử' },
        ]}
      />
      {o.isLoading && <Loading />}
      <ErrorBox error={o.error} />
      {o.data && tab === 'providers' && <ProvidersTab o={o.data} />}
      {o.data && tab === 'models' && <ModelsTab o={o.data} />}
      {o.data && tab === 'settings' && <SettingsTab o={o.data} />}
      {tab === 'usage' && <UsageTab />}
      {o.data && tab === 'calc' && <CalculatorTab o={o.data} />}
      {o.data && tab === 'play' && <PlaygroundTab o={o.data} />}
    </>
  );
}
