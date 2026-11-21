import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider } from '@aisrm/shared';
import { estimateTokens } from '@aisrm/shared';

/**
 * Adapter nhà cung cấp AI. Mỗi adapter: liệt kê model (kiểm tra kết nối) và sinh văn bản, trả usage thực tế.
 * - Anthropic: SDK chính thức @anthropic-ai/sdk.
 * - OpenAI, Gemini: REST API công khai của từng hãng (khóa gửi qua header, không đặt trong URL).
 * Không ghi nội dung prompt/kết quả vào log.
 */

export interface CompletionInput {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  /** Ghi chú về việc nhà cung cấp chuyển sang model dự phòng (Claude server-side fallback). */
  fallbackUsed: boolean;
}

export class ProviderError extends Error {
  constructor(
    public code: 'AUTH' | 'RATE_LIMIT' | 'BAD_REQUEST' | 'NOT_FOUND' | 'TIMEOUT' | 'UPSTREAM' | 'REFUSED',
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT = 60_000;

async function http<T>(url: string, init: RequestInit, timeoutMs = TIMEOUT): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new ProviderError('TIMEOUT', 'Nhà cung cấp không phản hồi kịp thời.');
    throw new ProviderError('UPSTREAM', 'Không kết nối được nhà cung cấp AI.');
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = (await r.json()) as { error?: { message?: string } | string };
      msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? msg);
    } catch {
      /* bỏ qua */
    }
    msg = msg.slice(0, 300);
    if (r.status === 401 || r.status === 403) throw new ProviderError('AUTH', `Khóa API không hợp lệ hoặc không đủ quyền (${msg}).`, r.status);
    if (r.status === 429) throw new ProviderError('RATE_LIMIT', `Vượt giới hạn tần suất/hạn mức của nhà cung cấp (${msg}).`, r.status);
    if (r.status === 404) throw new ProviderError('NOT_FOUND', `Không tìm thấy model (${msg}).`, r.status);
    if (r.status >= 400 && r.status < 500) throw new ProviderError('BAD_REQUEST', msg, r.status);
    throw new ProviderError('UPSTREAM', `Lỗi phía nhà cung cấp (${msg}).`, r.status);
  }
  return (await r.json()) as T;
}

// ---------------- OpenAI ----------------
const openai = {
  async listModels(apiKey: string): Promise<string[]> {
    const j = await http<{ data: { id: string }[] }>('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    }, 20_000);
    return j.data.map((m) => m.id).sort();
  },
  async complete(i: CompletionInput): Promise<CompletionResult> {
    const j = await http<{
      choices: { message: { content: string | null }; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    }>(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${i.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: i.model,
          max_completion_tokens: i.maxOutputTokens,
          messages: [
            { role: 'system', content: i.system },
            { role: 'user', content: i.prompt },
          ],
        }),
      },
      i.timeoutMs,
    );
    return {
      text: j.choices[0]?.message.content ?? '',
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
      stopReason: j.choices[0]?.finish_reason ?? null,
      fallbackUsed: false,
    };
  },
};

// ---------------- Anthropic (SDK chính thức) ----------------
/** Model Claude hỗ trợ tham số dự phòng server-side khi bị từ chối vì chính sách an toàn. */
const CLAUDE_FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function anthropicError(e: unknown): never {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    throw new ProviderError('AUTH', 'Khóa API Claude không hợp lệ hoặc không đủ quyền.', e.status);
  }
  if (e instanceof Anthropic.NotFoundError) throw new ProviderError('NOT_FOUND', 'Không tìm thấy model Claude.', 404);
  if (e instanceof Anthropic.RateLimitError) throw new ProviderError('RATE_LIMIT', 'Vượt giới hạn tần suất của Anthropic.', 429);
  if (e instanceof Anthropic.BadRequestError) throw new ProviderError('BAD_REQUEST', e.message.slice(0, 300), 400);
  if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError('TIMEOUT', 'Anthropic không phản hồi kịp thời.');
  if (e instanceof Anthropic.APIError) throw new ProviderError('UPSTREAM', `Lỗi phía Anthropic (${e.status ?? 'kết nối'}).`, e.status);
  throw e;
}

const anthropic = {
  async listModels(apiKey: string): Promise<string[]> {
    const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
    try {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids.sort();
    } catch (e) {
      anthropicError(e);
    }
  },
  async complete(i: CompletionInput): Promise<CompletionResult> {
    const client = new Anthropic({ apiKey: i.apiKey, timeout: i.timeoutMs ?? TIMEOUT, maxRetries: 1 });
    try {
      const params = {
        model: i.model,
        max_tokens: i.maxOutputTokens,
        system: i.system,
        messages: [{ role: 'user' as const, content: i.prompt }],
      };
      const response = CLAUDE_FALLBACK_MODELS.has(i.model)
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
      if (response.stop_reason === 'refusal') {
        throw new ProviderError('REFUSED', 'Claude từ chối yêu cầu theo chính sách an toàn.');
      }
      let text = '';
      for (const block of response.content) if (block.type === 'text') text += block.text;
      const usage = response.usage as { input_tokens: number; output_tokens: number; iterations?: { type: string }[] | null };
      return {
        text,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        stopReason: response.stop_reason ?? null,
        fallbackUsed: (usage.iterations ?? []).some((it) => it.type === 'fallback_message'),
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      anthropicError(e);
    }
  },
};

// ---------------- Gemini ----------------
const gemini = {
  async listModels(apiKey: string): Promise<string[]> {
    const j = await http<{ models: { name: string; supportedGenerationMethods?: string[] }[] }>(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': apiKey } },
      20_000,
    );
    return j.models
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort();
  },
  async complete(i: CompletionInput): Promise<CompletionResult> {
    if (!/^[\w.-]+$/.test(i.model)) throw new ProviderError('BAD_REQUEST', 'Tên model không hợp lệ.');
    const j = await http<{
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/${i.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': i.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: i.system }] },
          contents: [{ role: 'user', parts: [{ text: i.prompt }] }],
          generationConfig: { maxOutputTokens: i.maxOutputTokens },
        }),
      },
      i.timeoutMs,
    );
    if (j.promptFeedback?.blockReason) throw new ProviderError('REFUSED', `Gemini chặn yêu cầu (${j.promptFeedback.blockReason}).`);
    const c = j.candidates?.[0];
    const u = j.usageMetadata ?? {};
    return {
      text: (c?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      inputTokens: u.promptTokenCount ?? 0,
      // Token suy luận được tính phí như token đầu ra
      outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      stopReason: c?.finishReason ?? null,
      fallbackUsed: false,
    };
  },
};

// ---------------- Mock (không gọi mạng, không phát sinh chi phí) ----------------
export const mockProvider = {
  async complete(i: Omit<CompletionInput, 'apiKey'>): Promise<CompletionResult> {
    const text =
      `[KẾT QUẢ GIẢ LẬP — AI_MODE=mock, không gọi nhà cung cấp thật]\n` +
      `Đã nhận yêu cầu (${i.prompt.length} ký tự) cho model "${i.model}". ` +
      `Chuyển AI Center sang chế độ "live" và nạp khóa API để nhận kết quả thật.`;
    return { text, inputTokens: estimateTokens(i.system + i.prompt), outputTokens: estimateTokens(text), stopReason: 'mock', fallbackUsed: false };
  },
};

export const PROVIDERS: Record<AiProvider, { listModels(k: string): Promise<string[]>; complete(i: CompletionInput): Promise<CompletionResult> }> = {
  openai,
  anthropic,
  gemini,
};

/** Kiểm tra sơ bộ định dạng khóa (không gửi đi đâu). */
export function looksLikeKey(provider: AiProvider, key: string): boolean {
  const k = key.trim();
  if (k.length < 20 || k.length > 300 || /\s/.test(k)) return false;
  if (provider === 'anthropic') return k.startsWith('sk-ant-');
  if (provider === 'openai') return k.startsWith('sk-');
  return true;
}
