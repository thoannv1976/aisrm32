import type { CallForm } from './types';

export interface FormIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

/**
 * Kiểm tra hồ sơ theo quy tắc xác định (không dùng AI): trường bắt buộc, độ dài,
 * giá trị chọn, kinh phí, tài liệu bắt buộc trong checklist.
 */
export function validateSubmission(
  form: CallForm,
  fields: Record<string, unknown>,
  attachedChecklistKeys: string[],
  extra: { title?: string; budgetVnd?: number | null; durationMonths?: number | null } = {},
): FormIssue[] {
  const issues: FormIssue[] = [];
  if (extra.title !== undefined && !extra.title.trim()) {
    issues.push({ field: 'title', message: 'Chưa nhập tên đề tài.', severity: 'ERROR' });
  }
  if ('budgetVnd' in extra) {
    const b = extra.budgetVnd;
    if (b === null || b === undefined || b <= 0) {
      issues.push({ field: 'budgetVnd', message: 'Chưa nhập kinh phí đề xuất (VND, số nguyên dương).', severity: 'ERROR' });
    } else if (!Number.isInteger(b)) {
      issues.push({ field: 'budgetVnd', message: 'Kinh phí phải là số nguyên VND.', severity: 'ERROR' });
    }
  }
  if ('durationMonths' in extra && (!extra.durationMonths || extra.durationMonths <= 0)) {
    issues.push({ field: 'durationMonths', message: 'Chưa nhập thời gian thực hiện (tháng).', severity: 'ERROR' });
  }
  for (const f of form.fields) {
    const v = fields[f.key];
    const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (f.required && empty) {
      issues.push({ field: f.key, message: `Chưa nhập "${f.label}".`, severity: 'ERROR' });
      continue;
    }
    if (empty) continue;
    if (f.maxLength && typeof v === 'string' && v.length > f.maxLength) {
      issues.push({ field: f.key, message: `"${f.label}" vượt quá ${f.maxLength} ký tự.`, severity: 'ERROR' });
    }
    if (f.type === 'select' && f.options && !f.options.includes(String(v))) {
      issues.push({ field: f.key, message: `Giá trị "${f.label}" không thuộc danh mục.`, severity: 'ERROR' });
    }
    if (f.type === 'number' && Number.isNaN(Number(v))) {
      issues.push({ field: f.key, message: `"${f.label}" phải là số.`, severity: 'ERROR' });
    }
  }
  for (const c of form.checklist) {
    if (c.required && !attachedChecklistKeys.includes(c.key)) {
      issues.push({ field: `checklist.${c.key}`, message: `Thiếu tài liệu bắt buộc: ${c.label}.`, severity: 'ERROR' });
    }
  }
  return issues;
}

export function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}
