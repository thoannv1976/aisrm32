import { describe, expect, it } from 'vitest';
import {
  availableActions,
  checkTransition,
  hasRoleFor,
  normalizeDoi,
  normalizeTitle,
  PROPOSAL_WORKFLOW,
  PUBLICATION_WORKFLOW,
  validateSubmission,
  type RoleBinding,
} from './index';

const p = (uid: string, bindings: RoleBinding[]) => ({ uid, bindings });
const unitPathA = ['fac-a', 'campus-hn', 'root'];
const unitPathB = ['fac-b', 'campus-hn', 'root'];

describe('authz', () => {
  it('vai trò cấp đơn vị chỉ áp dụng cho đơn vị đó và cấp dưới', () => {
    const focalA = p('u1', [{ role: 'UNIT_FOCAL', scopeType: 'unit', scopeId: 'fac-a' }]);
    expect(hasRoleFor(focalA, ['UNIT_FOCAL'], unitPathA)).toBe(true);
    expect(hasRoleFor(focalA, ['UNIT_FOCAL'], unitPathB)).toBe(false);
    const campusHead = p('u2', [{ role: 'UNIT_HEAD', scopeType: 'unit', scopeId: 'campus-hn' }]);
    expect(hasRoleFor(campusHead, ['UNIT_HEAD'], unitPathB)).toBe(true);
  });

  it('ủy quyền hết hạn không còn hiệu lực', () => {
    const delegated = p('u3', [
      { role: 'VICE_RECTOR', scopeType: 'tenant', validUntil: '2020-01-01T00:00:00Z', delegatedBy: 'x' },
    ]);
    expect(hasRoleFor(delegated, ['VICE_RECTOR'], unitPathA)).toBe(false);
  });
});

describe('proposal workflow', () => {
  const owner = p('owner', [{ role: 'RESEARCHER', scopeType: 'tenant' }]);
  const focalA = p('focal', [{ role: 'UNIT_FOCAL', scopeType: 'unit', scopeId: 'fac-a' }]);
  const focalB = p('focalB', [{ role: 'UNIT_FOCAL', scopeType: 'unit', scopeId: 'fac-b' }]);
  const officer = p('officer', [{ role: 'SCIENCE_OFFICER', scopeType: 'tenant' }]);
  const vr = p('vr', [{ role: 'VICE_RECTOR', scopeType: 'tenant' }]);
  const base = { ownerUid: 'owner', unitPath: unitPathA };

  it('chủ hồ sơ nộp được, người khác không', () => {
    expect(checkTransition(PROPOSAL_WORKFLOW, 'DRAFT', 'submit', { ...base, principal: owner })).toMatchObject({ ok: true, to: 'UNIT_REVIEW' });
    expect(checkTransition(PROPOSAL_WORKFLOW, 'DRAFT', 'submit', { ...base, principal: officer })).toMatchObject({ ok: false, reason: 'FORBIDDEN_ROLE' });
  });

  it('đầu mối đơn vị khác không xác nhận được', () => {
    expect(checkTransition(PROPOSAL_WORKFLOW, 'UNIT_REVIEW', 'unit_confirm', { ...base, principal: focalA }).ok).toBe(true);
    expect(checkTransition(PROPOSAL_WORKFLOW, 'UNIT_REVIEW', 'unit_confirm', { ...base, principal: focalB })).toMatchObject({ ok: false, reason: 'FORBIDDEN_ROLE' });
  });

  it('không tự duyệt hồ sơ của mình', () => {
    const selfFocal = p('owner', [{ role: 'UNIT_FOCAL', scopeType: 'unit', scopeId: 'fac-a' }]);
    expect(checkTransition(PROPOSAL_WORKFLOW, 'UNIT_REVIEW', 'unit_confirm', { ...base, principal: selfFocal })).toMatchObject({ ok: false, reason: 'SELF_APPROVAL' });
  });

  it('bỏ bước phản biện theo cấu hình, không giả đã phản biện', () => {
    const r1 = checkTransition(PROPOSAL_WORKFLOW, 'SCIENCE_REVIEW', 'science_forward', { ...base, principal: officer, flags: { expertReview: false } });
    expect(r1).toMatchObject({ ok: true, to: 'APPROVAL_PENDING' });
    const r2 = checkTransition(PROPOSAL_WORKFLOW, 'SCIENCE_REVIEW', 'science_forward', { ...base, principal: officer, flags: { expertReview: true } });
    expect(r2).toMatchObject({ ok: true, to: 'EXPERT_REVIEW' });
  });

  it('trả bổ sung bắt buộc lý do và quay đúng bước khi nộp lại', () => {
    expect(checkTransition(PROPOSAL_WORKFLOW, 'SCIENCE_REVIEW', 'request_revision', { ...base, principal: officer }, '')).toMatchObject({ ok: false, reason: 'COMMENT_REQUIRED' });
    expect(checkTransition(PROPOSAL_WORKFLOW, 'SCIENCE_REVIEW', 'request_revision', { ...base, principal: officer }, 'Thiếu dự toán').ok).toBe(true);
    expect(checkTransition(PROPOSAL_WORKFLOW, 'NEEDS_REVISION', 'resubmit', { ...base, principal: owner, returnTo: 'SCIENCE_REVIEW' })).toMatchObject({ ok: true, to: 'SCIENCE_REVIEW' });
  });

  it('chỉ lãnh đạo phê duyệt; hiển thị đúng thao tác', () => {
    expect(checkTransition(PROPOSAL_WORKFLOW, 'APPROVAL_PENDING', 'approve', { ...base, principal: officer }).ok).toBe(false);
    expect(checkTransition(PROPOSAL_WORKFLOW, 'APPROVAL_PENDING', 'approve', { ...base, principal: vr }).ok).toBe(true);
    const acts = availableActions(PROPOSAL_WORKFLOW, 'APPROVAL_PENDING', { ...base, principal: vr }).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(['approve', 'request_revision', 'reject']));
    expect(acts).not.toContain('submit');
  });
});

describe('publication workflow — phân tách nhiệm vụ', () => {
  it('người xác minh không được tự xác nhận', () => {
    const both = p('head', [{ role: 'SCIENCE_HEAD', scopeType: 'tenant' }]);
    const ctx = { ownerUid: 'author', unitPath: unitPathA, principal: both, actorsByAction: { verify: 'head' } };
    expect(checkTransition(PUBLICATION_WORKFLOW, 'VERIFIED', 'confirm', ctx)).toMatchObject({ ok: false, reason: 'SEPARATION_OF_DUTIES' });
    expect(checkTransition(PUBLICATION_WORKFLOW, 'VERIFIED', 'confirm', { ...ctx, actorsByAction: { verify: 'other' } }).ok).toBe(true);
  });
});

describe('DOI và tiêu đề', () => {
  it('chuẩn hóa DOI', () => {
    expect(normalizeDoi('https://doi.org/10.1016/J.ABC.2024.01')).toBe('10.1016/j.abc.2024.01');
    expect(normalizeDoi('doi: 10.1234/xyz')).toBe('10.1234/xyz');
    expect(normalizeDoi('abc')).toBeNull();
  });
  it('chuẩn hóa tiêu đề tiếng Việt', () => {
    expect(normalizeTitle('Đổi mới  sáng tạo — Việt Nam!')).toBe('doi moi sang tao viet nam');
  });
});

describe('kiểm tra hồ sơ xác định', () => {
  const form = {
    version: 1,
    fields: [
      { key: 'objective', label: 'Mục tiêu', type: 'textarea' as const, required: true },
      { key: 'field', label: 'Lĩnh vực', type: 'select' as const, required: true, options: ['Kinh tế', 'Luật'] },
    ],
    checklist: [{ key: 'proposal_doc', label: 'Thuyết minh', required: true }],
  };
  it('báo thiếu trường, thiếu tài liệu, kinh phí sai', () => {
    const issues = validateSubmission(form, { field: 'Y học' }, [], { title: 'X', budgetVnd: 1.5, durationMonths: 12 });
    const keys = issues.map((i) => i.field);
    expect(keys).toEqual(expect.arrayContaining(['objective', 'field', 'checklist.proposal_doc', 'budgetVnd']));
  });
  it('hồ sơ đủ thì không có lỗi', () => {
    expect(validateSubmission(form, { objective: 'abc', field: 'Luật' }, ['proposal_doc'], { title: 'X', budgetVnd: 100000000, durationMonths: 12 })).toEqual([]);
  });
});

import { computeCost, maskKey, microsToUsd, parseUsdToMicros } from './ai';

describe('AI — tính chi phí', () => {
  it('đổi giá USD sang micro-USD và ngược lại', () => {
    expect(parseUsdToMicros('4')).toBe(4_000_000);
    expect(parseUsdToMicros('0,15')).toBe(150_000);
    expect(parseUsdToMicros('')).toBeNull();
    expect(() => parseUsdToMicros('abc')).toThrow();
    expect(microsToUsd(2_500_000)).toBe('2.5');
  });
  it('tính chi phí đúng và làm tròn lên', () => {
    // 1.000 token vào × $4/1M + 500 token ra × $20/1M = $0.004 + $0.01 = $0.014 = 14.000 micro-USD
    const c = computeCost(1000, 500, { inputPriceMicrosPerMTok: 4_000_000, outputPriceMicrosPerMTok: 20_000_000 }, 26000);
    expect(c).toEqual({ priceKnown: true, costUsdMicros: 14000, costVnd: 364 });
    // 1 token × $0.10/1M = 0.1 micro → làm tròn lên 1 micro
    expect(computeCost(1, 0, { inputPriceMicrosPerMTok: 100_000, outputPriceMicrosPerMTok: 0 }, 26000).costUsdMicros).toBe(1);
  });
  it('chưa có giá thì không trả chi phí 0', () => {
    expect(computeCost(1000, 1000, { inputPriceMicrosPerMTok: null, outputPriceMicrosPerMTok: 1 }, 26000)).toEqual({ priceKnown: false, costUsdMicros: null, costVnd: null });
  });
  it('che khóa API', () => {
    expect(maskKey('sk-abcdefghijklmnop1234')).toBe('••••1234');
  });
});

import { aggregate, RUBRIC_TEMPLATES, sheetTotal, validateScores, type ReviewSheet } from './council';

describe('Hội đồng — phiếu chấm và tổng hợp', () => {
  const r = RUBRIC_TEMPLATES[0];
  const full = { urgency: 18, objective: 16, method: 20, output: 15, capacity: 12 };
  it('kiểm tra phiếu: đủ tiêu chí, trong khoảng, bước 0,5', () => {
    expect(validateScores(r, full)).toEqual([]);
    expect(validateScores(r, { ...full, method: 26 }).length).toBe(1);
    expect(validateScores(r, { ...full, method: 20.3 }).length).toBe(1);
    expect(validateScores(r, { urgency: 10 }).length).toBe(4);
    expect(sheetTotal(r, full)).toBe(81);
  });
  it('tổng hợp: trung bình phiếu đã nộp; thiếu phiếu thì chưa đề nghị', () => {
    const mk = (uid: string, total: number, status: 'SUBMITTED' | 'DRAFT' = 'SUBMITTED'): ReviewSheet => ({
      memberUid: uid, memberName: uid, targetId: 't1', scores: { ...full }, comment: '', total, status, submittedAt: null, updatedAt: '',
    });
    const t = { id: 't1', code: 'DX', title: 'X' };
    expect(aggregate(r, t, [mk('a', 80)], 3).suggestion).toBe('INSUFFICIENT');
    const res = aggregate(r, t, [mk('a', 80), mk('b', 65), mk('c', 10, 'DRAFT')], 3);
    expect(res.average).toBe(72.5);
    expect(res.submitted).toBe(2);
    expect(res.suggestion).toBe('PASS');
    expect(aggregate(r, t, [mk('a', 60), mk('b', 65)], 2).suggestion).toBe('FAIL');
  });
});
