import { normalizeDoi, normalizeTitle, type Publication } from '@aisrm/shared';

/**
 * Kiểm chứng công bố qua Crossref (nguồn mở). Chỉ so khớp metadata — KHÔNG kết luận chỉ mục Scopus/WoS hay xếp hạng Q;
 * cán bộ Phòng KH xác minh và quyết định.
 * Không gửi thông tin cá nhân: chỉ gửi DOI.
 */

export type CheckStatus = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'NO_DATA';

export interface VerificationResult {
  source: 'crossref';
  doi: string;
  found: boolean;
  checkedAt: string;
  message: string;
  crossref: { title: string | null; venue: string | null; year: number | null; authors: string[]; type: string | null; publisher: string | null; url: string | null } | null;
  checks: { field: string; label: string; status: CheckStatus; ours: string; theirs: string; note?: string }[];
  overall: 'MATCH' | 'REVIEW' | 'NOT_FOUND' | 'ERROR';
}

interface CrossrefWork {
  title?: string[];
  'container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
  published?: { 'date-parts'?: number[][] };
  author?: { given?: string; family?: string; name?: string }[];
  type?: string;
  publisher?: string;
  URL?: string;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
export function setCrossrefFetcherForTest(f: Fetcher) {
  fetcher = f;
}

function tokens(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(' ').filter((t) => t.length > 1));
}

/** Độ tương đồng Jaccard theo từ (0..1). */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function verifyWithCrossref(pub: Pick<Publication, 'doi' | 'title' | 'venue' | 'year' | 'authors'>): Promise<VerificationResult> {
  const doi = normalizeDoi(pub.doi);
  const checkedAt = new Date().toISOString();
  const base = { source: 'crossref' as const, doi: doi ?? String(pub.doi ?? ''), checkedAt };
  if (!doi) return { ...base, found: false, message: 'Công bố chưa có DOI hợp lệ để kiểm chứng.', crossref: null, checks: [], overall: 'NOT_FOUND' };

  let r: Response;
  try {
    r = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'AI-SRM/0.1 (research management; publication verification)' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ...base, found: false, message: 'Không kết nối được Crossref. Thử lại sau.', crossref: null, checks: [], overall: 'ERROR' };
  }
  if (r.status === 404) return { ...base, found: false, message: 'Crossref không có bản ghi cho DOI này — kiểm tra lại DOI hoặc nguồn đăng ký DOI khác.', crossref: null, checks: [], overall: 'NOT_FOUND' };
  if (!r.ok) return { ...base, found: false, message: `Crossref trả lỗi ${r.status}. Thử lại sau.`, crossref: null, checks: [], overall: 'ERROR' };

  const w = ((await r.json()) as { message: CrossrefWork }).message;
  const title = w.title?.[0] ?? null;
  const venue = w['container-title']?.[0] ?? null;
  const year = w.issued?.['date-parts']?.[0]?.[0] ?? w.published?.['date-parts']?.[0]?.[0] ?? null;
  const authors = (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);

  const checks: VerificationResult['checks'] = [];
  if (title) {
    const s = similarity(pub.title, title);
    checks.push({ field: 'title', label: 'Tên bài', status: s >= 0.85 ? 'MATCH' : s >= 0.5 ? 'PARTIAL' : 'MISMATCH', ours: pub.title, theirs: title, note: `Mức trùng khớp ${Math.round(s * 100)}%` });
  } else checks.push({ field: 'title', label: 'Tên bài', status: 'NO_DATA', ours: pub.title, theirs: '' });

  if (venue) {
    const s = similarity(pub.venue || '', venue);
    checks.push({ field: 'venue', label: 'Tạp chí / nơi công bố', status: !pub.venue ? 'PARTIAL' : s >= 0.7 ? 'MATCH' : s >= 0.3 ? 'PARTIAL' : 'MISMATCH', ours: pub.venue || '(chưa khai báo)', theirs: venue });
  } else checks.push({ field: 'venue', label: 'Tạp chí / nơi công bố', status: 'NO_DATA', ours: pub.venue || '', theirs: '' });

  if (year) {
    const diff = Math.abs(year - pub.year);
    checks.push({ field: 'year', label: 'Năm', status: diff === 0 ? 'MATCH' : diff === 1 ? 'PARTIAL' : 'MISMATCH', ours: String(pub.year), theirs: String(year), note: diff === 1 ? 'Lệch 1 năm — có thể do năm online/in khác nhau' : undefined });
  } else checks.push({ field: 'year', label: 'Năm', status: 'NO_DATA', ours: String(pub.year), theirs: '' });

  if (authors.length) {
    const theirTokens = new Set(authors.flatMap((a) => [...tokens(a)]));
    const matched = pub.authors.filter((a) => [...tokens(a.name)].some((t) => theirTokens.has(t)));
    const status: CheckStatus = matched.length === pub.authors.length ? 'MATCH' : matched.length > 0 ? 'PARTIAL' : 'MISMATCH';
    checks.push({
      field: 'authors',
      label: 'Tác giả',
      status,
      ours: pub.authors.map((a) => a.name).join('; '),
      theirs: authors.join('; '),
      note: `${matched.length}/${pub.authors.length} tác giả khai báo tìm thấy trong Crossref (so theo từ trong họ tên)`,
    });
    if (authors.length !== pub.authors.length) {
      checks.push({ field: 'authorCount', label: 'Số tác giả', status: 'PARTIAL', ours: String(pub.authors.length), theirs: String(authors.length) });
    }
  } else checks.push({ field: 'authors', label: 'Tác giả', status: 'NO_DATA', ours: pub.authors.map((a) => a.name).join('; '), theirs: '' });

  const bad = checks.some((c) => c.status === 'MISMATCH' || c.status === 'PARTIAL');
  return {
    ...base,
    found: true,
    message: bad ? 'Có thông tin lệch so với Crossref — cán bộ cần đối chiếu minh chứng.' : 'Thông tin khai báo khớp với Crossref.',
    crossref: { title, venue, year, authors, type: w.type ?? null, publisher: w.publisher ?? null, url: w.URL ?? null },
    checks,
    overall: bad ? 'REVIEW' : 'MATCH',
  };
}
