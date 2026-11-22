import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  AI_PROVIDERS,
  computeCost,
  hasAnyRole,
  maskKey,
  monthKey,
  parseUsdToMicros,
  type AiModelConfig,
  type AiProvider,
  type AiProviderStatus,
  type AiUsageRecord,
  type Principal,
} from '@aisrm/shared';
import { z } from 'zod';
import { loadSettings, monthSpend, runAi } from '../ai/gateway';
import { looksLikeKey, PROVIDERS, ProviderError } from '../ai/providers';
import { secretStore } from '../ai/secrets';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { AppError, badRequest, forbidden, notFound } from '../common/errors';
import { nowIso, tcol } from '../infra';
import { audit } from '../common/records';
import { parse } from '../common/util';

const ADMIN_ROLES = ['AI_ADMIN', 'SYS_ADMIN'] as const;
function requireAdmin(p: Principal) {
  if (!hasAnyRole(p, [...ADMIN_ROLES])) throw forbidden('Chỉ quản trị AI / quản trị hệ thống được thực hiện.');
}
function providerParam(v: string): AiProvider {
  if (!(AI_PROVIDERS as readonly string[]).includes(v)) throw notFound('Nhà cung cấp không hỗ trợ.');
  return v as AiProvider;
}
const modelDocId = (provider: AiProvider, modelId: string) => `${provider}__${modelId.replace(/[^\w.-]/g, '_')}`;

const priceStr = z.union([z.string().max(20), z.number(), z.null()]).optional();
const modelBody = z.object({
  provider: z.enum(AI_PROVIDERS),
  modelId: z.string().min(1).max(120).regex(/^[\w.:/-]+$/, 'Tên model chỉ gồm chữ, số, . - _ : /'),
  label: z.string().max(120).optional(),
  inputPricePerMTokUsd: priceStr,
  outputPricePerMTokUsd: priceStr,
  priceEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priceSource: z.string().max(300).nullable().optional(),
  enabled: z.boolean().default(true),
});

const settingsBody = z.object({
  mode: z.enum(['mock', 'live']),
  usdToVnd: z.number().int().min(1000).max(1_000_000),
  usdToVndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyBudgetVnd: z.number().int().min(0).max(100_000_000_000),
  hardStop: z.boolean(),
  killSwitch: z.boolean(),
  defaultModelId: z.string().max(200).nullable(),
  maxOutputTokens: z.number().int().min(64).max(16000),
});

async function providerStatuses(tenantId: string): Promise<AiProviderStatus[]> {
  const snaps = await Promise.all(AI_PROVIDERS.map((p) => tcol(tenantId, 'aiProviders').doc(p).get()));
  return AI_PROVIDERS.map((provider, i) => {
    const d = snaps[i].exists ? snaps[i].data()! : {};
    return {
      provider,
      enabled: d.enabled ?? true,
      keyStatus: d.keyStatus ?? 'MISSING',
      keyHint: d.keyHint ?? null,
      keyUpdatedAt: d.keyUpdatedAt ?? null,
      keyUpdatedByName: d.keyUpdatedByName ?? null,
      lastTest: d.lastTest ?? null,
      availableModels: d.availableModels ?? [],
    };
  });
}

@Controller('ai')
export class AiController {
  /** Trạng thái AI cho mọi người dùng (không lộ cấu hình nhạy cảm). */
  @Get('status')
  async status(@CurrentPrincipal() p: Principal) {
    const s = await loadSettings(p.tenantId);
    return { enabled: !s.killSwitch && !!s.defaultModelId, mode: s.mode, isAdmin: hasAnyRole(p, [...ADMIN_ROLES]) };
  }

  @Get('admin/overview')
  async overview(@CurrentPrincipal() p: Principal) {
    requireAdmin(p);
    const [providers, models, settings, spend] = await Promise.all([
      providerStatuses(p.tenantId),
      tcol(p.tenantId, 'aiModels').get(),
      loadSettings(p.tenantId),
      monthSpend(p.tenantId),
    ]);
    return {
      providers,
      models: models.docs.map((d) => ({ id: d.id, ...d.data() }) as AiModelConfig).sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId)),
      settings,
      spend,
      storage: process.env.FIRESTORE_EMULATOR_HOST ? 'Mã hóa cục bộ (chỉ môi trường thử)' : 'Google Secret Manager',
    };
  }

  @Put('admin/providers/:provider/key')
  async setKey(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('provider') prov: string, @Body() body: unknown) {
    requireAdmin(p);
    const provider = providerParam(prov);
    const { apiKey } = parse(z.object({ apiKey: z.string().min(1).max(400) }), body);
    const key = apiKey.trim();
    if (!looksLikeKey(provider, key)) throw badRequest('Khóa API không đúng định dạng của nhà cung cấp đã chọn.');
    await secretStore().put(p.tenantId, provider, key);
    await tcol(p.tenantId, 'aiProviders').doc(provider).set(
      { keyStatus: 'SET', keyHint: maskKey(key), keyUpdatedAt: nowIso(), keyUpdatedBy: p.uid, keyUpdatedByName: p.displayName, lastTest: null },
      { merge: true },
    );
    await audit({ actor: p, action: 'ai.provider.key_set', resourceType: 'aiProvider', resourceId: provider, requestId: rid, detail: maskKey(key) });
    return { provider, keyStatus: 'SET', keyHint: maskKey(key) };
  }

  @Delete('admin/providers/:provider/key')
  async removeKey(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('provider') prov: string) {
    requireAdmin(p);
    const provider = providerParam(prov);
    await secretStore().remove(p.tenantId, provider);
    await tcol(p.tenantId, 'aiProviders').doc(provider).set({ keyStatus: 'MISSING', keyHint: null, keyUpdatedAt: nowIso(), keyUpdatedBy: p.uid, keyUpdatedByName: p.displayName, lastTest: null }, { merge: true });
    await audit({ actor: p, action: 'ai.provider.key_removed', resourceType: 'aiProvider', resourceId: provider, requestId: rid });
    return { provider, keyStatus: 'MISSING' };
  }

  @Put('admin/providers/:provider')
  async setProvider(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('provider') prov: string, @Body() body: unknown) {
    requireAdmin(p);
    const provider = providerParam(prov);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), body);
    await tcol(p.tenantId, 'aiProviders').doc(provider).set({ enabled }, { merge: true });
    await audit({ actor: p, action: enabled ? 'ai.provider.enable' : 'ai.provider.disable', resourceType: 'aiProvider', resourceId: provider, requestId: rid });
    return { provider, enabled };
  }

  /** Kiểm tra kết nối: dùng khóa đã lưu để lấy danh sách model của nhà cung cấp (không tốn token). */
  @Post('admin/providers/:provider/test')
  async test(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('provider') prov: string) {
    requireAdmin(p);
    const provider = providerParam(prov);
    const key = await secretStore().get(p.tenantId, provider);
    if (!key) throw new AppError(409, 'AI_KEY_MISSING', 'Chưa nạp khóa API cho nhà cung cấp này.');
    let lastTest: AiProviderStatus['lastTest'];
    let models: string[] = [];
    try {
      models = (await PROVIDERS[provider].listModels(key)).slice(0, 300);
      lastTest = { ok: true, at: nowIso(), message: `Kết nối thành công, ${models.length} model khả dụng.`, modelCount: models.length };
    } catch (e) {
      lastTest = { ok: false, at: nowIso(), message: e instanceof ProviderError ? e.message : 'Không kết nối được nhà cung cấp.', modelCount: null };
    }
    await tcol(p.tenantId, 'aiProviders').doc(provider).set({ lastTest, ...(lastTest.ok ? { availableModels: models } : {}) }, { merge: true });
    await audit({ actor: p, action: 'ai.provider.test', resourceType: 'aiProvider', resourceId: provider, requestId: rid, result: lastTest.ok ? 'SUCCESS' : 'ERROR', detail: lastTest.message });
    return lastTest;
  }

  @Post('admin/models')
  async upsertModel(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    requireAdmin(p);
    const b = parse(modelBody, body);
    let input: number | null, output: number | null;
    try {
      input = parseUsdToMicros(b.inputPricePerMTokUsd ?? null);
      output = parseUsdToMicros(b.outputPricePerMTokUsd ?? null);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const id = modelDocId(b.provider, b.modelId);
    const doc: Omit<AiModelConfig, 'id'> = {
      provider: b.provider,
      modelId: b.modelId,
      label: b.label?.trim() || b.modelId,
      inputPriceMicrosPerMTok: input,
      outputPriceMicrosPerMTok: output,
      priceEffectiveDate: b.priceEffectiveDate ?? null,
      priceSource: b.priceSource ?? null,
      enabled: b.enabled,
    };
    await tcol(p.tenantId, 'aiModels').doc(id).set({ ...doc, updatedAt: nowIso(), updatedBy: p.uid });
    await audit({ actor: p, action: 'ai.model.upsert', resourceType: 'aiModel', resourceId: id, requestId: rid, detail: `in=${input ?? '?'} out=${output ?? '?'} micro-USD/1M` });
    return { id, ...doc };
  }

  @Patch('admin/models/:id')
  async toggleModel(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    requireAdmin(p);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), body);
    const ref = tcol(p.tenantId, 'aiModels').doc(id);
    if (!(await ref.get()).exists) throw notFound();
    await ref.update({ enabled, updatedAt: nowIso(), updatedBy: p.uid });
    await audit({ actor: p, action: enabled ? 'ai.model.enable' : 'ai.model.disable', resourceType: 'aiModel', resourceId: id, requestId: rid });
    return { id, enabled };
  }

  @Delete('admin/models/:id')
  async deleteModel(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    requireAdmin(p);
    const settings = await loadSettings(p.tenantId);
    if (settings.defaultModelId === id) throw badRequest('Không xóa được model đang là mặc định; hãy chọn model mặc định khác trước.');
    await tcol(p.tenantId, 'aiModels').doc(id).delete();
    await audit({ actor: p, action: 'ai.model.delete', resourceType: 'aiModel', resourceId: id, requestId: rid });
    return { id, deleted: true };
  }

  @Put('admin/settings')
  async saveSettings(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    requireAdmin(p);
    const b = parse(settingsBody, body);
    if (b.defaultModelId && !(await tcol(p.tenantId, 'aiModels').doc(b.defaultModelId).get()).exists) {
      throw badRequest('Model mặc định không tồn tại.');
    }
    await tcol(p.tenantId, 'aiConfig').doc('settings').set({ ...b, usdToVndDate: b.usdToVndDate ?? null, updatedAt: nowIso(), updatedBy: p.uid });
    await audit({
      actor: p,
      action: 'ai.settings.update',
      resourceType: 'aiConfig',
      resourceId: 'settings',
      requestId: rid,
      detail: `mode=${b.mode} budget=${b.monthlyBudgetVnd} hardStop=${b.hardStop} kill=${b.killSwitch}`,
    });
    return b;
  }

  /** Báo cáo sử dụng & chi phí theo tháng (không chứa nội dung prompt). */
  @Get('admin/usage')
  async usage(@CurrentPrincipal() p: Principal, @Query('month') month?: string) {
    requireAdmin(p);
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey();
    const snap = await tcol(p.tenantId, 'aiUsage').where('month', '==', m).limit(5000).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AiUsageRecord).sort((a, b) => (a.at < b.at ? 1 : -1));
    const group = (key: (u: AiUsageRecord) => string) => {
      const map = new Map<string, { key: string; calls: number; errors: number; inputTokens: number; outputTokens: number; costVnd: number; unpriced: number }>();
      for (const u of items) {
        if (u.status === 'BLOCKED') continue;
        const k = key(u);
        const g = map.get(k) ?? { key: k, calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costVnd: 0, unpriced: 0 };
        g.calls++;
        if (u.status === 'ERROR') g.errors++;
        g.inputTokens += u.inputTokens;
        g.outputTokens += u.outputTokens;
        g.costVnd += u.costVnd ?? 0;
        if (!u.mock && !u.priceKnown && u.status === 'SUCCESS') g.unpriced++;
        map.set(k, g);
      }
      return [...map.values()].sort((a, b) => b.costVnd - a.costVnd || b.calls - a.calls);
    };
    const settings = await loadSettings(p.tenantId);
    const spend = await monthSpend(p.tenantId, m);
    return {
      month: m,
      budgetVnd: settings.monthlyBudgetVnd,
      spend,
      byModel: group((u) => `${u.provider}/${u.modelId}`),
      byFeature: group((u) => u.feature),
      byUser: group((u) => u.userName),
      byDay: group((u) => u.at.slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key)),
      blocked: items.filter((u) => u.status === 'BLOCKED').length,
      recent: items.slice(0, 100),
    };
  }

  /** Máy tính chi phí: ước tính chi phí theo số token và bảng giá đã cấu hình. */
  @Post('estimate')
  async estimate(@CurrentPrincipal() p: Principal, @Body() body: unknown) {
    requireAdmin(p);
    const b = parse(
      z.object({ modelConfigId: z.string().max(200), inputTokens: z.number().int().min(0).max(100_000_000), outputTokens: z.number().int().min(0).max(100_000_000), calls: z.number().int().min(1).max(10_000_000).default(1) }),
      body,
    );
    const m = await tcol(p.tenantId, 'aiModels').doc(b.modelConfigId).get();
    if (!m.exists) throw notFound('Không tìm thấy model.');
    const settings = await loadSettings(p.tenantId);
    const one = computeCost(b.inputTokens, b.outputTokens, m.data() as AiModelConfig, settings.usdToVnd);
    return {
      perCall: one,
      total: one.priceKnown ? { costUsdMicros: one.costUsdMicros! * b.calls, costVnd: one.costVnd! * b.calls } : null,
      usdToVnd: settings.usdToVnd,
      calls: b.calls,
    };
  }

  /** Gọi thử một model (chỉ quản trị) — ghi usage và chi phí thật như mọi tác vụ AI. */
  @Post('admin/playground')
  async playground(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    requireAdmin(p);
    const b = parse(z.object({ modelConfigId: z.string().max(200), prompt: z.string().min(1).max(20000), maxOutputTokens: z.number().int().min(16).max(4000).default(500) }), body);
    const r = await runAi(p, {
      feature: 'playground',
      modelConfigId: b.modelConfigId,
      system: 'Bạn là trợ lý của hệ thống quản lý khoa học AI-SRM. Trả lời ngắn gọn bằng tiếng Việt.',
      prompt: b.prompt,
      maxOutputTokens: b.maxOutputTokens,
    });
    await audit({ actor: p, action: 'ai.playground', resourceType: 'aiModel', resourceId: b.modelConfigId, requestId: rid, detail: `${r.usage.inputTokens}+${r.usage.outputTokens} tokens` });
    return r;
  }
}
