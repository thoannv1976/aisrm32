import {
  computeCost,
  DEFAULT_AI_SETTINGS,
  estimateTokens,
  monthKey,
  type AiModelConfig,
  type AiSettings,
  type AiUsageRecord,
  type Principal,
} from '@aisrm/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { AppError } from '../common/errors';
import { nowIso, tcol } from '../common/firebase';
import { mockProvider, PROVIDERS, ProviderError, type CompletionResult } from './providers';
import { secretStore } from './secrets';

export async function loadSettings(tenantId: string): Promise<AiSettings> {
  const s = await tcol(tenantId, 'aiConfig').doc('settings').get();
  return { ...DEFAULT_AI_SETTINGS, ...(s.exists ? (s.data() as Partial<AiSettings>) : {}) };
}

export async function loadModel(tenantId: string, id: string): Promise<AiModelConfig | null> {
  const s = await tcol(tenantId, 'aiModels').doc(id).get();
  return s.exists ? ({ id: s.id, ...s.data() } as AiModelConfig) : null;
}

export async function monthSpend(tenantId: string, month = monthKey()) {
  const s = await tcol(tenantId, 'aiUsageMonthly').doc(month).get();
  return {
    month,
    costVnd: (s.get('costVnd') as number | undefined) ?? 0,
    calls: (s.get('calls') as number | undefined) ?? 0,
    unpricedCalls: (s.get('unpricedCalls') as number | undefined) ?? 0,
    inputTokens: (s.get('inputTokens') as number | undefined) ?? 0,
    outputTokens: (s.get('outputTokens') as number | undefined) ?? 0,
  };
}

export interface RunAiInput {
  feature: string;
  modelConfigId?: string | null;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface RunAiResult {
  text: string;
  usage: Omit<AiUsageRecord, 'id'>;
  /** Chế độ mock: chi phí ước tính nếu chạy thật với model này. */
  estimatedIfLive: { priceKnown: boolean; costVnd: number | null } | null;
  model: { id: string; provider: string; modelId: string; label: string };
  fallbackUsed: boolean;
}

async function record(p: Principal, u: Omit<AiUsageRecord, 'id'>) {
  await tcol(p.tenantId, 'aiUsage').add(u);
  if (u.status === 'BLOCKED') return;
  await tcol(p.tenantId, 'aiUsageMonthly')
    .doc(u.month)
    .set(
      {
        month: u.month,
        calls: FieldValue.increment(1),
        errors: FieldValue.increment(u.status === 'ERROR' ? 1 : 0),
        inputTokens: FieldValue.increment(u.inputTokens),
        outputTokens: FieldValue.increment(u.outputTokens),
        costVnd: FieldValue.increment(u.costVnd ?? 0),
        costUsdMicros: FieldValue.increment(u.costUsdMicros ?? 0),
        unpricedCalls: FieldValue.increment(!u.mock && !u.priceKnown && u.status === 'SUCCESS' ? 1 : 0),
        updatedAt: nowIso(),
      },
      { merge: true },
    );
}

/**
 * Mọi tác vụ AI đi qua đây: kiểm tra tắt khẩn cấp, model, khóa, ngân sách tháng → gọi nhà cung cấp →
 * ghi usage (token thực tế, độ trễ, chi phí) — không ghi nội dung prompt/kết quả.
 */
export async function runAi(p: Principal, input: RunAiInput): Promise<RunAiResult> {
  const settings = await loadSettings(p.tenantId);
  const month = monthKey();
  const base = { at: nowIso(), month, uid: p.uid, userName: p.displayName, feature: input.feature };

  if (settings.killSwitch) {
    throw new AppError(503, 'AI_DISABLED', 'AI đang tạm tắt theo cấu hình quản trị. Nghiệp vụ khác vẫn hoạt động bình thường.');
  }
  const modelId = input.modelConfigId ?? settings.defaultModelId;
  if (!modelId) throw new AppError(409, 'AI_NO_MODEL', 'Chưa chọn model AI mặc định trong AI Center.');
  const model = await loadModel(p.tenantId, modelId);
  if (!model || !model.enabled) throw new AppError(409, 'AI_MODEL_DISABLED', 'Model AI chưa được bật hoặc không tồn tại.');
  const maxOutputTokens = Math.min(input.maxOutputTokens ?? settings.maxOutputTokens, 16000);
  const modelInfo = { id: model.id, provider: model.provider, modelId: model.modelId, label: model.label };

  // ---- Chế độ giả lập ----
  if (settings.mode === 'mock') {
    const r = await mockProvider.complete({ model: model.modelId, system: input.system, prompt: input.prompt, maxOutputTokens });
    const est = computeCost(r.inputTokens, r.outputTokens, model, settings.usdToVnd);
    const usage: Omit<AiUsageRecord, 'id'> = {
      ...base,
      provider: 'mock',
      modelId: model.modelId,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      latencyMs: 0,
      status: 'SUCCESS',
      errorCode: null,
      priceKnown: false,
      costUsdMicros: null,
      costVnd: null,
      mock: true,
    };
    await record(p, usage);
    return { text: r.text, usage, estimatedIfLive: { priceKnown: est.priceKnown, costVnd: est.costVnd }, model: modelInfo, fallbackUsed: false };
  }

  // ---- Chế độ thật ----
  const providerStatus = await tcol(p.tenantId, 'aiProviders').doc(model.provider).get();
  if (providerStatus.exists && providerStatus.get('enabled') === false) {
    throw new AppError(409, 'AI_PROVIDER_DISABLED', 'Nhà cung cấp AI này đang bị tắt.');
  }
  const apiKey = await secretStore().get(p.tenantId, model.provider);
  if (!apiKey) throw new AppError(409, 'AI_KEY_MISSING', 'Chưa nạp khóa API cho nhà cung cấp này.');

  if (settings.monthlyBudgetVnd > 0 && settings.hardStop) {
    const spent = await monthSpend(p.tenantId, month);
    const est = computeCost(estimateTokens(input.system + input.prompt), maxOutputTokens, model, settings.usdToVnd);
    if (spent.costVnd + (est.costVnd ?? 0) > settings.monthlyBudgetVnd) {
      await record(p, { ...base, provider: model.provider, modelId: model.modelId, inputTokens: 0, outputTokens: 0, latencyMs: 0, status: 'BLOCKED', errorCode: 'BUDGET', priceKnown: est.priceKnown, costUsdMicros: 0, costVnd: 0, mock: false });
      throw new AppError(429, 'AI_BUDGET_EXCEEDED', `Đã chạm ngân sách AI tháng ${month} (${spent.costVnd.toLocaleString('vi-VN')} / ${settings.monthlyBudgetVnd.toLocaleString('vi-VN')} ₫).`);
    }
  }

  const started = Date.now();
  let r: CompletionResult;
  try {
    r = await PROVIDERS[model.provider].complete({ apiKey, model: model.modelId, system: input.system, prompt: input.prompt, maxOutputTokens });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'UPSTREAM';
    await record(p, { ...base, provider: model.provider, modelId: model.modelId, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, status: 'ERROR', errorCode: code, priceKnown: false, costUsdMicros: null, costVnd: null, mock: false });
    throw new AppError(code === 'AUTH' ? 424 : code === 'RATE_LIMIT' ? 429 : 502, `AI_${code}`, (e as Error).message);
  }
  const cost = computeCost(r.inputTokens, r.outputTokens, model, settings.usdToVnd);
  const usage: Omit<AiUsageRecord, 'id'> = {
    ...base,
    provider: model.provider,
    modelId: model.modelId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    latencyMs: Date.now() - started,
    status: 'SUCCESS',
    errorCode: null,
    ...cost,
    mock: false,
  };
  await record(p, usage);
  return { text: r.text, usage, estimatedIfLive: null, model: modelInfo, fallbackUsed: r.fallbackUsed };
}
