/**
 * Nhà cung cấp "Máy chủ AI nội bộ" (L4): Ollama / LocalAI / vLLM… qua API tương thích OpenAI (/v1/chat/completions).
 * Dữ liệu không rời máy chủ của trường.
 *
 * Rút ra từ lần đo 22/11/2026 (docs/KE_HOACH_BAN_LOCAL_POSTGRESQL.md §2.5):
 *  - mô hình suy luận trả "reasoning" riêng hoặc thẻ <think> → bỏ khỏi câu trả lời, mặc định TẮT suy luận;
 *  - một GPU xử lý tuần tự → hàng đợi có giới hạn, báo "đang bận" thay vì để quá thời gian;
 *  - nạp mô hình lần đầu có thể mất ~2 phút → thời gian chờ 180 giây và chức năng "làm nóng".
 * Địa chỉ máy chủ AI do người cài đặt cấu hình (biến môi trường), KHÔNG nhận từ giao diện → tránh SSRF.
 */
import { estimateTokens } from '@aisrm/shared';
import { ProviderError, type CompletionInput, type CompletionResult } from './provider-types';

export interface LocalAiConfig {
  baseUrl: string | null;
  apiKey: string | null;
  concurrency: number;
  queueMax: number;
  timeoutMs: number;
  /** Bật suy luận (mặc định tắt: nhanh hơn, không ăn hết giới hạn token). */
  reasoning: boolean;
}

export function localAiConfig(): LocalAiConfig {
  const raw = process.env.LOCAL_AI_BASE_URL?.trim() || null;
  return {
    baseUrl: raw ? raw.replace(/\/+$/, '').replace(/\/v1$/, '') : null,
    apiKey: process.env.LOCAL_AI_API_KEY?.trim() || null,
    concurrency: Math.max(1, Number(process.env.LOCAL_AI_CONCURRENCY ?? 1)),
    queueMax: Math.max(0, Number(process.env.LOCAL_AI_QUEUE_MAX ?? 10)),
    timeoutMs: Math.max(5_000, Number(process.env.LOCAL_AI_TIMEOUT_MS ?? 180_000)),
    reasoning: process.env.LOCAL_AI_REASONING === 'true',
  };
}

// ---------- hàng đợi theo GPU ----------

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(cfg: LocalAiConfig, fn: () => Promise<T>): Promise<T> {
  if (active >= cfg.concurrency) {
    if (waiting.length >= cfg.queueMax) {
      throw new ProviderError('RATE_LIMIT', `Máy chủ AI nội bộ đang bận (${active} yêu cầu đang xử lý, ${waiting.length} đang chờ). Vui lòng thử lại sau ít phút.`);
    }
    await new Promise<void>((res) => waiting.push(res));
  } else active++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next(); // chuyển suất cho yêu cầu kế tiếp, giữ nguyên số đang xử lý
    else active--;
  }
}

export function localAiQueue() {
  return { active, waiting: waiting.length };
}

/** Chỉ cho test. */
export function resetLocalAiQueueForTest() {
  active = 0;
  waiting.length = 0;
}

// ---------- gọi máy chủ ----------

function requireBase(cfg: LocalAiConfig): string {
  if (!cfg.baseUrl) throw new ProviderError('BAD_REQUEST', 'Chưa cấu hình máy chủ AI nội bộ (biến LOCAL_AI_BASE_URL).');
  if (!/^https?:\/\/[^\s/]+$/.test(cfg.baseUrl)) throw new ProviderError('BAD_REQUEST', 'LOCAL_AI_BASE_URL không hợp lệ (dạng http://may-chu:cong).');
  return cfg.baseUrl;
}

async function post<T>(cfg: LocalAiConfig, path: string, body: unknown, apiKey: string | null, timeoutMs: number): Promise<T> {
  const key = apiKey || cfg.apiKey;
  let r: Response;
  try {
    r = await fetch(`${requireBase(cfg)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if ((e as Error).name === 'TimeoutError') throw new ProviderError('TIMEOUT', `Máy chủ AI nội bộ không trả lời trong ${Math.round(timeoutMs / 1000)} giây (có thể đang nạp mô hình — hãy "làm nóng" trước).`);
    throw new ProviderError('UPSTREAM', 'Không kết nối được máy chủ AI nội bộ. Kiểm tra dịch vụ Ollama / LocalAI đã chạy chưa.');
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = (await r.json()) as { error?: { message?: string } | string };
      msg = (typeof j.error === 'string' ? j.error : (j.error?.message ?? msg)).slice(0, 300);
    } catch {
      /* bỏ qua */
    }
    if (r.status === 401 || r.status === 403) throw new ProviderError('AUTH', `Máy chủ AI nội bộ từ chối khóa truy cập (${msg}).`, r.status);
    if (r.status === 404) throw new ProviderError('NOT_FOUND', `Máy chủ AI nội bộ không có mô hình này (${msg}).`, r.status);
    if (r.status === 429) throw new ProviderError('RATE_LIMIT', `Máy chủ AI nội bộ đang quá tải (${msg}).`, r.status);
    if (r.status >= 400 && r.status < 500) throw new ProviderError('BAD_REQUEST', msg, r.status);
    throw new ProviderError('UPSTREAM', `Lỗi máy chủ AI nội bộ (${msg}).`, r.status);
  }
  return (await r.json()) as T;
}

/** Bỏ phần suy luận (<think>…</think>, kể cả thẻ mở không đóng do bị cắt). */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

interface ChatResponse {
  choices?: { message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createLocalProvider(getCfg: () => LocalAiConfig = localAiConfig) {
  return {
    async listModels(apiKey: string): Promise<string[]> {
      const cfg = getCfg();
      const j = await post<{ data?: { id: string }[] }>(cfg, '/v1/models', undefined, apiKey, 15_000);
      return (j.data ?? []).map((m) => m.id).sort();
    },

    async complete(i: CompletionInput): Promise<CompletionResult> {
      const cfg = getCfg();
      requireBase(cfg);
      return withSlot(cfg, async () => {
        const body = {
          model: i.model,
          messages: [
            { role: 'system', content: i.system },
            { role: 'user', content: i.prompt },
          ],
          max_tokens: i.maxOutputTokens,
          temperature: 0.2,
          stream: false,
          // Tắt suy luận: LocalAI/vLLM đọc chat_template_kwargs, Ollama đọc think, chuẩn OpenAI đọc reasoning_effort.
          ...(cfg.reasoning ? {} : { chat_template_kwargs: { enable_thinking: false }, think: false, reasoning_effort: 'none' }),
        };
        const j = await post<ChatResponse>(cfg, '/v1/chat/completions', body, i.apiKey, i.timeoutMs ?? cfg.timeoutMs);
        const c = j.choices?.[0];
        const text = stripReasoning(c?.message?.content ?? '');
        const reasoning = c?.message?.reasoning ?? c?.message?.reasoning_content ?? '';
        if (!text) {
          throw new ProviderError(
            'UPSTREAM',
            reasoning
              ? 'Mô hình chỉ trả phần suy luận, chưa kịp trả lời (hãy tăng giới hạn token hoặc tắt suy luận).'
              : 'Máy chủ AI nội bộ trả về câu trả lời rỗng.',
          );
        }
        return {
          text,
          inputTokens: j.usage?.prompt_tokens ?? estimateTokens(i.system + i.prompt),
          outputTokens: j.usage?.completion_tokens ?? estimateTokens(text + reasoning),
          stopReason: c?.finish_reason ?? null,
          fallbackUsed: false,
        };
      });
    },

    /** Nạp sẵn mô hình vào GPU bằng một yêu cầu rất ngắn — để người dùng đầu tiên không phải chờ. */
    async warmUp(model: string, apiKey: string | null = null): Promise<{ ms: number }> {
      const cfg = getCfg();
      const started = Date.now();
      await withSlot(cfg, () =>
        post(cfg, '/v1/chat/completions', { model, messages: [{ role: 'user', content: 'Xin chào' }], max_tokens: 1, stream: false, ...(cfg.reasoning ? {} : { chat_template_kwargs: { enable_thinking: false }, think: false }) }, apiKey, cfg.timeoutMs),
      );
      return { ms: Date.now() - started };
    },
  };
}

export const localProvider = createLocalProvider();
