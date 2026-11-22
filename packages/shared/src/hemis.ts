/**
 * Danh mục dữ liệu NCKH theo HEMIS (mục 12 — API đồng bộ dữ liệu NCKH).
 * Mã ở đây là mã nội bộ AI-SRM; bảng ánh xạ sang mã danh mục HEMIS chính thức được cấu hình khi kết nối thật.
 */

export const PROJECT_CLASSIFICATIONS = {
  BASIC: 'Nghiên cứu cơ bản',
  APPLIED: 'Nghiên cứu ứng dụng',
  DEVELOPMENT: 'Triển khai thực nghiệm',
} as const;

export const PROJECT_LEVELS = {
  NATIONAL: 'Cấp Nhà nước',
  MINISTRY: 'Cấp Bộ / Tỉnh',
  UNIVERSITY: 'Cấp cơ sở (Trường)',
  UNIT: 'Cấp đơn vị (Khoa / Viện)',
  STUDENT: 'Sinh viên NCKH',
} as const;

/** Lĩnh vực KH&CN — 6 nhóm theo Bảng phân loại lĩnh vực nghiên cứu KH&CN. */
export const SCIENCE_FIELDS = {
  NATURAL: 'Khoa học tự nhiên',
  ENGINEERING: 'Khoa học kỹ thuật và công nghệ',
  MEDICAL: 'Khoa học y, dược',
  AGRICULTURE: 'Khoa học nông nghiệp',
  SOCIAL: 'Khoa học xã hội',
  HUMANITIES: 'Khoa học nhân văn',
} as const;

export const FUNDING_SOURCES = {
  STATE: 'Ngân sách nhà nước',
  UNIVERSITY: 'Nguồn của Trường',
  ENTERPRISE: 'Doanh nghiệp',
  INTERNATIONAL: 'Tài trợ quốc tế',
  OTHER: 'Nguồn khác',
} as const;

export const EVALUATION_RESULTS = {
  EXCELLENT: 'Xuất sắc',
  GOOD: 'Tốt / Khá',
  PASS: 'Đạt',
  FAIL: 'Không đạt',
} as const;

export type ProjectClassification = keyof typeof PROJECT_CLASSIFICATIONS;
export type ProjectLevel = keyof typeof PROJECT_LEVELS;
export type ScienceField = keyof typeof SCIENCE_FIELDS;
export type FundingSource = keyof typeof FUNDING_SOURCES;
export type EvaluationResult = keyof typeof EVALUATION_RESULTS;

/** Thông tin đề tài theo HEMIS (Phòng KH cập nhật, xác nhận). */
export interface ProjectHemis {
  classification: ProjectClassification | null;
  level: ProjectLevel | null;
  field: ScienceField | null;
  fundingSource: FundingSource | null;
  hostAgency: string | null;
  evaluationResult: EvaluationResult | null;
  acceptanceDate: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

export const EMPTY_PROJECT_HEMIS: ProjectHemis = {
  classification: null,
  level: null,
  field: null,
  fundingSource: null,
  hostAgency: null,
  evaluationResult: null,
  acceptanceDate: null,
};

export const JOURNAL_SCOPES = { INTERNATIONAL: 'Tạp chí quốc tế', DOMESTIC: 'Tạp chí trong nước' } as const;
export type JournalScope = keyof typeof JOURNAL_SCOPES;
export const QUARTILES = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export type Quartile = (typeof QUARTILES)[number];

/** Mức giải thưởng NCKH sinh viên. */
export const STUDENT_PRIZES = {
  FIRST: 'Giải Nhất',
  SECOND: 'Giải Nhì',
  THIRD: 'Giải Ba',
  CONSOLATION: 'Giải Khuyến khích',
  NONE: 'Không đạt giải',
} as const;
export type StudentPrize = keyof typeof STUDENT_PRIZES;

export const catLabel = <T extends Record<string, string>>(map: T, key: string | null | undefined): string => (key && key in map ? map[key as keyof T] : '—');
