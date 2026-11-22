import { normalizeDoi } from '@aisrm/shared';

/**
 * ORCID Public API (nguồn mở, không cần khóa). Chỉ gửi mã ORCID — không gửi thông tin cá nhân khác.
 * https://pub.orcid.org/v3.0/{orcid}/works
 */

export interface OrcidWork {
  putCode: string;
  title: string;
  type: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
}

export interface OrcidResult {
  orcid: string;
  ok: boolean;
  message: string;
  works: OrcidWork[];
  fetchedAt: string;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
export function setOrcidFetcherForTest(f: Fetcher) {
  fetcher = f;
}

/** Kiểm tra định dạng và chữ số kiểm tra ISO 7064 11,2 của ORCID. */
export function normalizeOrcid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])/i.exec(raw.trim());
  if (!m) return null;
  const digits = (m[1] + m[2] + m[3] + m[4]).toUpperCase();
  let total = 0;
  for (const ch of digits.slice(0, 15)) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  const check = r === 10 ? 'X' : String(r);
  if (check !== digits[15]) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12)}`;
}

interface OrcidSummary {
  'put-code'?: number;
  title?: { title?: { value?: string } };
  type?: string;
  'publication-date'?: { year?: { value?: string } } | null;
  'journal-title'?: { value?: string } | null;
  'external-ids'?: { 'external-id'?: { 'external-id-type'?: string; 'external-id-value'?: string; 'external-id-url'?: { value?: string } | null }[] };
  url?: { value?: string } | null;
}

export async function fetchOrcidWorks(orcidRaw: string): Promise<OrcidResult> {
  const fetchedAt = new Date().toISOString();
  const orcid = normalizeOrcid(orcidRaw);
  if (!orcid) return { orcid: orcidRaw, ok: false, message: 'Mã ORCID không hợp lệ (dạng 0000-0000-0000-0000, chữ số kiểm tra đúng).', works: [], fetchedAt };
  let r: Response;
  try {
    r = await fetcher(`https://pub.orcid.org/v3.0/${orcid}/works`, { headers: { Accept: 'application/json', 'User-Agent': 'AI-SRM/0.1 (research management)' }, signal: AbortSignal.timeout(15_000) });
  } catch {
    return { orcid, ok: false, message: 'Không kết nối được ORCID (bản cài không có Internet hoặc ORCID gián đoạn).', works: [], fetchedAt };
  }
  if (r.status === 404) return { orcid, ok: false, message: 'ORCID không có hồ sơ công khai với mã này.', works: [], fetchedAt };
  if (!r.ok) return { orcid, ok: false, message: `ORCID trả lỗi ${r.status}.`, works: [], fetchedAt };
  const body = (await r.json()) as { group?: { 'work-summary'?: OrcidSummary[] }[] };
  const works: OrcidWork[] = [];
  for (const g of body.group ?? []) {
    const s = g['work-summary']?.[0];
    if (!s) continue;
    const ids = s['external-ids']?.['external-id'] ?? [];
    const doiRaw = ids.find((x) => x['external-id-type']?.toLowerCase() === 'doi')?.['external-id-value'] ?? null;
    const year = Number(s['publication-date']?.year?.value);
    works.push({
      putCode: String(s['put-code'] ?? ''),
      title: s.title?.title?.value?.trim() ?? '(không có tiêu đề)',
      type: s.type ?? null,
      year: Number.isFinite(year) && year > 0 ? year : null,
      venue: s['journal-title']?.value ?? null,
      doi: normalizeDoi(doiRaw),
      url: s.url?.value ?? null,
    });
  }
  works.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return { orcid, ok: true, message: `ORCID có ${works.length} công trình công khai.`, works, fetchedAt };
}

/** Ánh xạ loại công trình ORCID sang loại công bố AI-SRM. */
export function orcidTypeToPublication(t: string | null): 'JOURNAL' | 'CONFERENCE' | 'BOOK' | 'BOOK_CHAPTER' | 'OTHER' {
  switch ((t ?? '').toLowerCase()) {
    case 'journal-article':
      return 'JOURNAL';
    case 'conference-paper':
    case 'conference-abstract':
      return 'CONFERENCE';
    case 'book':
    case 'edited-book':
      return 'BOOK';
    case 'book-chapter':
      return 'BOOK_CHAPTER';
    default:
      return 'OTHER';
  }
}
