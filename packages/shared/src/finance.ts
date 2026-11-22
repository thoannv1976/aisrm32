/**
 * M08 — Kinh phí và hợp đồng đề tài.
 * Số giải ngân / quyết toán do Phòng KH nhập theo chứng từ của Phòng Tài chính — hệ thống không tự suy ra.
 */

export const BUDGET_CATEGORIES = {
  LABOR: 'Thuê khoán chuyên môn',
  MATERIALS: 'Nguyên vật liệu, năng lượng',
  EQUIPMENT: 'Thiết bị, dụng cụ',
  TRAVEL: 'Công tác phí, điều tra khảo sát',
  WORKSHOP: 'Hội thảo, hội nghị',
  PUBLICATION: 'Công bố, sở hữu trí tuệ',
  MANAGEMENT: 'Quản lý chung',
  OTHER: 'Chi khác',
} as const;
export type BudgetCategory = keyof typeof BUDGET_CATEGORIES;

export interface BudgetLine {
  category: BudgetCategory;
  amountVnd: number;
  note: string | null;
}

export interface ProjectContract {
  contractNo: string;
  signedDate: string;
  valueVnd: number;
  fundingSource: string | null;
  note: string | null;
  updatedAt: string;
  updatedByName: string;
}

export const EXPENSE_STATUS_LABELS = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt chi',
  REJECTED: 'Không duyệt',
  DISBURSED: 'Đã giải ngân',
} as const;
export type ExpenseStatus = keyof typeof EXPENSE_STATUS_LABELS;

export interface ExpenseRequest {
  id: string;
  category: BudgetCategory;
  content: string;
  amountVnd: number;
  status: ExpenseStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  disbursedVnd: number | null;
  disbursedAt: string | null;
  voucherNo: string | null;
}

export const SETTLEMENT_LABELS = {
  NOT_STARTED: 'Chưa quyết toán',
  IN_PROGRESS: 'Đang quyết toán',
  SETTLED: 'Đã quyết toán',
} as const;
export type SettlementStatus = keyof typeof SETTLEMENT_LABELS;

export interface FinanceSummary {
  budgetTotalVnd: number;
  contractValueVnd: number;
  requestedVnd: number;
  approvedVnd: number;
  disbursedVnd: number;
  remainingVnd: number;
  byCategory: { category: BudgetCategory; label: string; budgetVnd: number; approvedVnd: number; disbursedVnd: number }[];
}

/** Tổng hợp xác định từ dự toán và đề nghị chi. */
export function summarizeFinance(lines: BudgetLine[], expenses: Pick<ExpenseRequest, 'category' | 'amountVnd' | 'status' | 'disbursedVnd'>[], contractValueVnd: number): FinanceSummary {
  const cats = new Map<BudgetCategory, { budgetVnd: number; approvedVnd: number; disbursedVnd: number }>();
  const row = (c: BudgetCategory) => {
    if (!cats.has(c)) cats.set(c, { budgetVnd: 0, approvedVnd: 0, disbursedVnd: 0 });
    return cats.get(c)!;
  };
  for (const l of lines) row(l.category).budgetVnd += l.amountVnd;
  let requested = 0;
  let approved = 0;
  let disbursed = 0;
  for (const e of expenses) {
    if (e.status !== 'REJECTED') requested += e.amountVnd;
    if (e.status === 'APPROVED' || e.status === 'DISBURSED') {
      approved += e.amountVnd;
      row(e.category).approvedVnd += e.amountVnd;
    }
    if (e.status === 'DISBURSED') {
      disbursed += e.disbursedVnd ?? 0;
      row(e.category).disbursedVnd += e.disbursedVnd ?? 0;
    }
  }
  const budgetTotal = lines.reduce((s, l) => s + l.amountVnd, 0);
  const cap = contractValueVnd || budgetTotal;
  return {
    budgetTotalVnd: budgetTotal,
    contractValueVnd,
    requestedVnd: requested,
    approvedVnd: approved,
    disbursedVnd: disbursed,
    remainingVnd: cap - disbursed,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, label: BUDGET_CATEGORIES[category], ...v })),
  };
}
