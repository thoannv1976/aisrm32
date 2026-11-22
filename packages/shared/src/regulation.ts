/**
 * Hỏi đáp quy chế (RAG): tách văn bản quy phạm thành Chương/Điều/Khoản và tìm kiếm BM25 trên tiếng Việt.
 * Hàm thuần, không phụ thuộc hạ tầng — dùng được cho cả bản cloud lẫn bản Local.
 */

export interface RegClause {
  /** Số khoản; 0 = điều không chia khoản. */
  no: number;
  text: string;
}
export interface RegArticle {
  chapter: string | null;
  number: number;
  title: string;
  clauses: RegClause[];
}
export interface ParsedRegulation {
  heading: string | null;
  articles: RegArticle[];
  warnings: string[];
}

const ARTICLE_RE = /^Điều\s+(\d+)\s*[.:]\s*(.*)$/;
const CHAPTER_RE = /^Chương\s+([IVXLC]+|\d+)\s*[.:]?\s*(.*)$/;
const CLAUSE_RE = /^(\d{1,2})\s*[.)]\s+(.+)$/;

/** Nhận văn bản thô (Markdown, TXT, hoặc text trích từ .docx) → cấu trúc điều khoản. */
export function parseRegulationText(raw: string): ParsedRegulation {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^#{1,6}\s+/, '').replace(/ /g, ' ').trim())
    .filter(Boolean);
  const articles: RegArticle[] = [];
  const warnings: string[] = [];
  let heading: string | null = null;
  let chapter: string | null = null;
  let pendingChapterTitle = false;
  let cur: RegArticle | null = null;

  for (const line of lines) {
    const ch = CHAPTER_RE.exec(line);
    if (ch) {
      chapter = ch[2] ? `Chương ${ch[1]}. ${ch[2]}` : `Chương ${ch[1]}`;
      pendingChapterTitle = !ch[2];
      cur = null;
      continue;
    }
    if (pendingChapterTitle && !ARTICLE_RE.test(line)) {
      chapter = `${chapter}. ${line}`;
      pendingChapterTitle = false;
      continue;
    }
    pendingChapterTitle = false;
    const ar = ARTICLE_RE.exec(line);
    if (ar) {
      const number = Number(ar[1]);
      if (articles.some((a) => a.number === number)) warnings.push(`Điều ${number} xuất hiện nhiều lần.`);
      cur = { chapter, number, title: ar[2].trim(), clauses: [] };
      articles.push(cur);
      continue;
    }
    if (!cur) {
      if (!heading && /QUY CHẾ|QUY ĐỊNH|HƯỚNG DẪN/i.test(line) && line === line.toUpperCase()) heading = line;
      continue;
    }
    const cl = CLAUSE_RE.exec(line);
    if (cl && Number(cl[1]) === (cur.clauses.at(-1)?.no ?? 0) + 1) {
      cur.clauses.push({ no: Number(cl[1]), text: cl[2].trim() });
    } else if (cur.clauses.length) {
      const last = cur.clauses[cur.clauses.length - 1];
      last.text += '\n' + line;
    } else {
      cur.clauses.push({ no: 0, text: line });
    }
  }
  if (!articles.length) warnings.push('Không nhận diện được "Điều N." nào — kiểm tra định dạng văn bản.');
  for (let i = 1; i < articles.length; i++) {
    if (articles[i].number !== articles[i - 1].number + 1) warnings.push(`Số điều không liên tục: Điều ${articles[i - 1].number} → Điều ${articles[i].number}.`);
  }
  for (const a of articles) if (!a.clauses.length) warnings.push(`Điều ${a.number} không có nội dung.`);
  return { heading, articles, warnings };
}

/** Trích dẫn chuẩn: "khoản 2 Điều 5" hoặc "Điều 5". */
export const citeLabel = (article: number, clause: number) => (clause > 0 ? `khoản ${clause} Điều ${article}` : `Điều ${article}`);

// ---------------- Tìm kiếm BM25 ----------------

/** Bỏ dấu tiếng Việt, chữ thường — để "gia hạn" khớp "gia han". */
export function normalizeVi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// Từ dừng xét trên dạng CÓ dấu (tránh loại nhầm "đề", "tài", "đăng", "chi" khi bỏ dấu); thêm vài dạng không dấu không nhập nhằng.
const STOP = new Set(
  (
    'và của là có các những được cho trong với khi thì này đó một theo từ đến về bị tại hoặc nếu như để không đã sẽ đang cần phải bao nhiêu gì nào thế sao tôi mình em anh chị bạn thấy hay ra vào làm mấy thì cũng rằng ạ nhé vậy ' +
    'duoc nhung khong nhieu trong nhu thi nay hoac neu'
  ).split(' '),
);

const syllables = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => ({ w: normalizeVi(w), stop: STOP.has(w) }));

/** Âm tiết (bỏ từ dừng) + cặp âm tiết liền nhau (bigram) — tiếng Việt nhiều từ ghép hai âm tiết. */
export function tokenizeVi(s: string): string[] {
  const syl = syllables(s);
  const out: string[] = [];
  for (let i = 0; i < syl.length; i++) {
    const { w, stop } = syl[i];
    if (!stop && (w.length > 1 || /\d/.test(w))) out.push(w);
    if (i + 1 < syl.length) out.push(`${w}_${syl[i + 1].w}`);
  }
  return out;
}

/** Đơn vị nội dung của câu hỏi (bỏ từ dừng và bigram có từ dừng) — dùng đo độ phủ. */
function contentTerms(s: string): string[] {
  const syl = syllables(s);
  const out = new Set<string>();
  for (let i = 0; i < syl.length; i++) {
    const { w, stop } = syl[i];
    if (stop) continue;
    if (w.length > 1 || /\d/.test(w)) out.add(w);
    if (i + 1 < syl.length && !syl[i + 1].stop) out.add(`${w}_${syl[i + 1].w}`);
  }
  return [...out];
}

export interface SearchDoc {
  id: string;
  text: string;
}
export interface Bm25Index {
  n: number;
  avgLen: number;
  df: Map<string, number>;
  docs: { id: string; tf: Map<string, number>; len: number }[];
}

export function buildBm25(docs: SearchDoc[]): Bm25Index {
  const df = new Map<string, number>();
  const out: Bm25Index['docs'] = [];
  let total = 0;
  for (const d of docs) {
    const toks = tokenizeVi(d.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    out.push({ id: d.id, tf, len: toks.length });
    total += toks.length;
  }
  return { n: docs.length, avgLen: docs.length ? total / docs.length : 0, df, docs: out };
}

export interface SearchHit {
  id: string;
  score: number;
  /** Số thuật ngữ (âm tiết) của câu hỏi xuất hiện trong đoạn. */
  matched: number;
  /** Tỷ lệ "khối lượng thông tin" (tổng IDF) của câu hỏi có trong đoạn, 0–1. Từ hiếm/không có trong quy chế nặng ký nhất. */
  coverage: number;
}

export function searchBm25(idx: Bm25Index, query: string, k = 6, k1 = 1.4, b = 0.75): { hits: SearchHit[]; queryTerms: number; coverage: number } {
  const q = [...new Set(tokenizeVi(query))];
  const qSyl = q.filter((t) => !t.includes('_'));
  const idfOf = (t: string) => {
    const df = idx.df.get(t) ?? 0;
    return Math.log(1 + (idx.n - df + 0.5) / (df + 0.5));
  };
  const content = contentTerms(query);
  const totalW = content.reduce((n, t) => n + idfOf(t), 0);
  const hits: SearchHit[] = [];
  for (const d of idx.docs) {
    let score = 0;
    let matched = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      if (!t.includes('_')) matched++;
      const df = idx.df.get(t) ?? 0;
      const idf = Math.log(1 + (idx.n - df + 0.5) / (df + 0.5));
      // Bigram mang nghĩa cụm từ → trọng số cao hơn
      const w = t.includes('_') ? 1.5 : 1;
      score += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / (idx.avgLen || 1))));
    }
    if (score > 0) {
      const got = content.reduce((n, t) => n + (d.tf.has(t) ? idfOf(t) : 0), 0);
      hits.push({ id: d.id, score: Math.round(score * 1000) / 1000, matched, coverage: totalW ? Math.round((got / totalW) * 1000) / 1000 : 0 });
    }
  }
  hits.sort((a, c) => c.score - a.score || a.id.localeCompare(c.id));
  // Độ phủ gộp của 3 đoạn đầu — câu trả lời thường dựa trên vài khoản liền nhau
  const top3 = hits.slice(0, 3).map((h) => idx.docs.find((d) => d.id === h.id)!);
  const got = content.reduce((n, t) => n + (top3.some((d) => d.tf.has(t)) ? idfOf(t) : 0), 0);
  const coverage = totalW ? Math.round((got / totalW) * 1000) / 1000 : 0;
  return { hits: hits.slice(0, k), queryTerms: qSyl.length, coverage };
}

/**
 * Ngưỡng "có căn cứ": 3 đoạn tốt nhất phủ ≥ 45% khối lượng thông tin (tổng IDF) của câu hỏi.
 * Câu hỏi chứa khái niệm quy chế không đề cập (vd "ký túc xá", "học phí") → độ phủ thấp → trả lời "không tìm thấy",
 * KHÔNG gọi mô hình (tránh bịa, tiết kiệm chi phí). Ngưỡng hiệu chỉnh trên bộ câu hỏi mẫu (test hồi quy).
 */
export function isGrounded(r: { hits: SearchHit[]; coverage: number }, minScore = 3, minCoverage = 0.45): boolean {
  const top = r.hits[0];
  return !!top && top.score >= minScore && r.coverage >= minCoverage;
}

/**
 * Trích các căn cứ trong câu trả lời của mô hình. Chấp nhận các cách viết mô hình nhỏ hay dùng:
 * "khoản X Điều Y", "khoản X, Điều Y", "khoản X của Điều Y", "Điều Y, khoản X", "Điều Y khoản X", "Điều Y".
 */
export function extractCitations(answer: string): { article: number; clause: number }[] {
  const out: { article: number; clause: number }[] = [];
  const re = /khoản\s+(\d+)\s*,?\s*(?:của\s+)?Điều\s+(\d+)|Điều\s+(\d+)\s*,?\s*khoản\s+(\d+)|Điều\s+(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer))) {
    if (m[2]) out.push({ article: Number(m[2]), clause: Number(m[1]) });
    else if (m[3]) out.push({ article: Number(m[3]), clause: Number(m[4]) });
    else out.push({ article: Number(m[5]), clause: 0 });
  }
  return out.filter((c, i) => out.findIndex((x) => x.article === c.article && x.clause === c.clause) === i);
}
