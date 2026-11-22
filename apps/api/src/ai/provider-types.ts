/** Kiểu dùng chung cho các adapter nhà cung cấp AI (tách riêng để tránh import vòng). */
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

