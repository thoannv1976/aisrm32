/**
 * M07 — Hội đồng và phản biện: kiểu dữ liệu, mẫu phiếu chấm, phép tổng hợp điểm xác định.
 * Điểm và kết luận do thành viên hội đồng quyết định; hệ thống chỉ tổng hợp theo công thức công khai.
 */

export interface RubricCriterion {
  key: string;
  label: string;
  maxScore: number;
  guidance?: string;
}

export interface Rubric {
  templateKey: string;
  version: number;
  name: string;
  criteria: RubricCriterion[];
  /** Ngưỡng tổng điểm trung bình để đề nghị thông qua (trên thang tổng). */
  passThreshold: number;
}

export const RUBRIC_TEMPLATES: Rubric[] = [
  {
    templateKey: 'proposal_review',
    version: 1,
    name: 'Xét duyệt thuyết minh đề tài cấp trường',
    passThreshold: 70,
    criteria: [
      { key: 'urgency', label: 'Tính cấp thiết, mới, ý nghĩa khoa học và thực tiễn', maxScore: 20 },
      { key: 'objective', label: 'Mục tiêu, nội dung rõ ràng, phù hợp', maxScore: 20 },
      { key: 'method', label: 'Phương pháp nghiên cứu khả thi, phù hợp mục tiêu', maxScore: 25 },
      { key: 'output', label: 'Sản phẩm dự kiến cụ thể, đo lường được', maxScore: 20 },
      { key: 'capacity', label: 'Năng lực nhóm, kinh phí và tiến độ hợp lý', maxScore: 15 },
    ],
  },
  {
    templateKey: 'student_award',
    version: 1,
    name: 'Đánh giá đề tài NCKH sinh viên',
    passThreshold: 60,
    criteria: [
      { key: 'idea', label: 'Ý tưởng, tính sáng tạo', maxScore: 20 },
      { key: 'method', label: 'Phương pháp và dữ liệu', maxScore: 30 },
      { key: 'result', label: 'Kết quả, khả năng ứng dụng', maxScore: 30 },
      { key: 'presentation', label: 'Trình bày, báo cáo', maxScore: 20 },
    ],
  },
  {
    templateKey: 'acceptance',
    version: 1,
    name: 'Nghiệm thu đề tài',
    passThreshold: 70,
    criteria: [
      { key: 'objective', label: 'Mức độ hoàn thành mục tiêu, nội dung', maxScore: 30 },
      { key: 'output', label: 'Sản phẩm đạt số lượng, chất lượng đăng ký', maxScore: 40 },
      { key: 'report', label: 'Chất lượng báo cáo tổng kết', maxScore: 20 },
      { key: 'schedule', label: 'Tiến độ, sử dụng kinh phí', maxScore: 10 },
    ],
  },
];

export type CouncilType = 'PROPOSAL_REVIEW' | 'STUDENT_AWARD' | 'ACCEPTANCE';
export const COUNCIL_TYPE_LABELS: Record<CouncilType, string> = {
  PROPOSAL_REVIEW: 'Xét duyệt thuyết minh',
  STUDENT_AWARD: 'Đánh giá NCKH sinh viên',
  ACCEPTANCE: 'Nghiệm thu đề tài',
};

export type CouncilStatus = 'SETUP' | 'SCORING' | 'SCORING_CLOSED' | 'MINUTES_CONFIRMED';
export const COUNCIL_STATUS_LABELS: Record<CouncilStatus, string> = {
  SETUP: 'Đang thành lập',
  SCORING: 'Đang chấm',
  SCORING_CLOSED: 'Đã khóa phiếu',
  MINUTES_CONFIRMED: 'Đã xác nhận biên bản',
};

export type CouncilRole = 'CHAIR' | 'SECRETARY' | 'REVIEWER' | 'MEMBER';
export const COUNCIL_ROLE_LABELS: Record<CouncilRole, string> = {
  CHAIR: 'Chủ tịch',
  SECRETARY: 'Thư ký',
  REVIEWER: 'Phản biện',
  MEMBER: 'Ủy viên',
};

export interface CouncilMember {
  uid: string;
  name: string;
  unitName: string | null;
  role: CouncilRole;
  status: 'INVITED' | 'ACCEPTED' | 'DECLINED';
  /** Khai báo xung đột lợi ích theo từng hồ sơ: targetId → có/không + ghi chú. */
  coi: Record<string, { hasConflict: boolean; note: string | null; declaredAt: string }>;
  respondedAt: string | null;
}

export interface CouncilTarget {
  id: string;
  type: 'proposal' | 'project';
  code: string;
  title: string;
  ownerUid: string;
  ownerName: string;
  unitName: string;
}

export interface ReviewSheet {
  memberUid: string;
  memberName: string;
  targetId: string;
  scores: Record<string, number>;
  comment: string;
  total: number;
  status: 'DRAFT' | 'SUBMITTED';
  submittedAt: string | null;
  updatedAt: string;
}

export interface TargetResult {
  targetId: string;
  code: string;
  title: string;
  submitted: number;
  eligible: number;
  average: number | null;
  min: number | null;
  max: number | null;
  byCriterion: Record<string, number | null>;
  /** Đề nghị theo ngưỡng (công thức), KHÔNG phải kết luận của hội đồng. */
  suggestion: 'PASS' | 'FAIL' | 'INSUFFICIENT';
}

export function rubricMax(r: Rubric): number {
  return r.criteria.reduce((s, c) => s + c.maxScore, 0);
}

/** Kiểm tra phiếu: điểm từng tiêu chí là số trong [0, max], bước 0,5. Trả danh sách lỗi. */
export function validateScores(r: Rubric, scores: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const c of r.criteria) {
    const v = scores[c.key];
    if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`Chưa chấm "${c.label}".`);
    else if (v < 0 || v > c.maxScore) errors.push(`"${c.label}" phải trong khoảng 0–${c.maxScore}.`);
    else if (Math.round(v * 2) !== v * 2) errors.push(`"${c.label}" chỉ nhận bước 0,5.`);
  }
  const extra = Object.keys(scores).filter((k) => !r.criteria.some((c) => c.key === k));
  if (extra.length) errors.push(`Tiêu chí không thuộc phiếu: ${extra.join(', ')}.`);
  return errors;
}

export function sheetTotal(r: Rubric, scores: Record<string, number>): number {
  return Math.round(r.criteria.reduce((s, c) => s + (scores[c.key] ?? 0), 0) * 10) / 10;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Tổng hợp điểm: trung bình cộng các phiếu đã nộp của thành viên đủ điều kiện (không xung đột lợi ích).
 * Cần tối thiểu `minSheets` phiếu để có đề nghị.
 */
export function aggregate(r: Rubric, target: Pick<CouncilTarget, 'id' | 'code' | 'title'>, sheets: ReviewSheet[], eligible: number, minSheets = 2): TargetResult {
  const done = sheets.filter((s) => s.targetId === target.id && s.status === 'SUBMITTED');
  const totals = done.map((s) => s.total);
  const average = totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  const byCriterion: Record<string, number | null> = {};
  for (const c of r.criteria) {
    byCriterion[c.key] = done.length ? round1(done.reduce((a, s) => a + (s.scores[c.key] ?? 0), 0) / done.length) : null;
  }
  return {
    targetId: target.id,
    code: target.code,
    title: target.title,
    submitted: done.length,
    eligible,
    average,
    min: totals.length ? Math.min(...totals) : null,
    max: totals.length ? Math.max(...totals) : null,
    byCriterion,
    suggestion: done.length < Math.min(minSheets, Math.max(eligible, 1)) || average === null ? 'INSUFFICIENT' : average >= r.passThreshold ? 'PASS' : 'FAIL',
  };
}
