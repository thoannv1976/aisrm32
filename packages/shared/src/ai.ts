/**
 * AI Gateway — kiểu dữ liệu và phép tính chi phí dùng chung (API + web).
 * Tiền tệ lưu bằng số nguyên: giá USD theo micro-USD (1 USD = 1.000.000), chi phí VND làm tròn lên.
 */

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini', 'local'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI (ChatGPT)',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
  local: 'Máy chủ AI nội bộ (Ollama / LocalAI)',
};

export interface AiProviderStatus {
  provider: AiProvider;
  enabled: boolean;
  keyStatus: 'MISSING' | 'SET';
  keyHint: string | null;
  keyUpdatedAt: string | null;
  keyUpdatedByName: string | null;
  lastTest: { ok: boolean; at: string; message: string; modelCount: number | null } | null;
  availableModels: string[];
}

export interface AiModelConfig {
  id: string;
  provider: AiProvider;
  modelId: string;
  label: string;
  /** Giá theo micro-USD cho 1 triệu token đầu vào/đầu ra; null = chưa cấu hình giá. */
  inputPriceMicrosPerMTok: number | null;
  outputPriceMicrosPerMTok: number | null;
  priceEffectiveDate: string | null;
  priceSource: string | null;
  enabled: boolean;
}

export interface AiSettings {
  /** mock: không gọi nhà cung cấp, không phát sinh chi phí; live: gọi thật bằng khóa của trường. */
  mode: 'mock' | 'live';
  /** Tỷ giá quy đổi VND cho 1 USD (số nguyên, do quản trị nhập). */
  usdToVnd: number;
  usdToVndDate: string | null;
  /** Ngân sách AI mỗi tháng (VND); 0 = không giới hạn. */
  monthlyBudgetVnd: number;
  /** Dừng gọi AI khi vượt ngân sách. */
  hardStop: boolean;
  /** Tắt toàn bộ AI khẩn cấp. */
  killSwitch: boolean;
  defaultModelId: string | null;
  /** Chọn model riêng cho từng chức năng (vd. hỏi đáp quy chế dùng AI nội bộ); thiếu thì dùng model mặc định. */
  featureModels: Record<string, string>;
  maxOutputTokens: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: 'mock',
  usdToVnd: 26000,
  usdToVndDate: null,
  monthlyBudgetVnd: 500000,
  hardStop: true,
  killSwitch: false,
  defaultModelId: null,
  featureModels: {},
  maxOutputTokens: 2000,
};

/** Các chức năng dùng AI — để chọn model theo chức năng và báo cáo sử dụng. */
export const AI_FEATURE_LABELS: Record<string, string> = {
  regulation_qa: 'Hỏi đáp quy chế',
  proposal_summary: 'Tóm tắt thuyết minh',
  proposal_check: 'Kiểm tra thuyết minh',
  report_draft: 'Dự thảo báo cáo',
  meeting_minutes: 'Dự thảo biên bản hội đồng',
  publication_verify: 'Giải thích kiểm chứng công bố',
  publication_extract: 'Trích thông tin công bố từ PDF',
  criteria_comments: 'Gợi ý nhận xét theo tiêu chí',
  researcher_intro: 'Giới thiệu nhà khoa học song ngữ',
  data_qa: 'Hỏi đáp số liệu',
  playground: 'Chạy thử (quản trị)',
};

export interface AiUsageRecord {
  id: string;
  at: string;
  month: string;
  uid: string;
  userName: string;
  feature: string;
  provider: AiProvider | 'mock';
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR' | 'BLOCKED';
  errorCode: string | null;
  priceKnown: boolean;
  costUsdMicros: number | null;
  costVnd: number | null;
  mock: boolean;
}

/** "3.5" hoặc "3,5" (USD / 1M token) → micro-USD. Trả null nếu rỗng; ném lỗi nếu sai định dạng. */
export function parseUsdToMicros(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || String(input).trim() === '') return null;
  const s = String(input).trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(s)) throw new Error(`Giá không hợp lệ: ${input}`);
  const [int, frac = ''] = s.split('.');
  return Number(int) * 1_000_000 + Number((frac + '000000').slice(0, 6));
}

export function microsToUsd(m: number | null | undefined): string {
  if (m === null || m === undefined) return '';
  const int = Math.floor(m / 1_000_000);
  const frac = String(m % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : String(int);
}

/**
 * Chi phí một lượt gọi. Không dùng số thực cho tiền: micro-USD làm tròn lên, VND làm tròn lên.
 * Trả priceKnown=false khi model chưa có giá (hiển thị "chưa xác định", không hiển thị 0).
 */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  model: Pick<AiModelConfig, 'inputPriceMicrosPerMTok' | 'outputPriceMicrosPerMTok'> | null,
  usdToVnd: number,
): { priceKnown: boolean; costUsdMicros: number | null; costVnd: number | null } {
  if (!model || model.inputPriceMicrosPerMTok === null || model.outputPriceMicrosPerMTok === null) {
    return { priceKnown: false, costUsdMicros: null, costVnd: null };
  }
  const numerator =
    BigInt(Math.max(0, Math.trunc(inputTokens))) * BigInt(model.inputPriceMicrosPerMTok) +
    BigInt(Math.max(0, Math.trunc(outputTokens))) * BigInt(model.outputPriceMicrosPerMTok);
  const M = BigInt(1_000_000);
  const costUsdMicros = (numerator + M - BigInt(1)) / M; // làm tròn lên
  const vndNumerator = costUsdMicros * BigInt(Math.max(0, Math.trunc(usdToVnd)));
  const costVnd = (vndNumerator + M - BigInt(1)) / M;
  return { priceKnown: true, costUsdMicros: Number(costUsdMicros), costVnd: Number(costVnd) };
}

/** Ước lượng token thô từ số ký tự (chỉ dùng để giữ ngân sách trước khi gọi; chi phí thật lấy từ usage). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function monthKey(d: Date = new Date()): string {
  // Theo giờ Việt Nam
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 7);
}

/** Che khóa API: chỉ giữ 4 ký tự cuối. */
export function maskKey(key: string): string {
  const k = key.trim();
  return k.length <= 8 ? '••••' : `••••${k.slice(-4)}`;
}
