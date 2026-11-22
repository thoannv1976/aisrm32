import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  BUDGET_CATEGORIES,
  hasRoleFor,
  SCIENCE_OFFICE,
  SETTLEMENT_LABELS,
  summarizeFinance,
  type BudgetLine,
  type ExpenseRequest,
  type Principal,
  type Project,
  type ProjectContract,
  type SettlementStatus,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { audit, canRead, holdersOf, notify } from '../common/records';
import { docData, parse } from '../common/util';
import { db, nowIso, tcol, type Tx } from '../infra';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày YYYY-MM-DD');
const category = z.enum(Object.keys(BUDGET_CATEGORIES) as [keyof typeof BUDGET_CATEGORIES, ...(keyof typeof BUDGET_CATEGORIES)[]]);
const money = z.number().int().nonnegative().max(1_000_000_000_000);

type FinanceProject = Project & {
  id: string;
  contract?: ProjectContract | null;
  budgetLines?: BudgetLine[];
  budgetLocked?: boolean;
  settlement?: { status: SettlementStatus; note: string | null; updatedAt: string; updatedByName: string } | null;
};

const isOffice = (p: Principal, r: Project) => hasRoleFor(p, SCIENCE_OFFICE, r.unitPath);
const isTeam = (p: Principal, r: Project) => r.ownerUid === p.uid || r.memberUids.includes(p.uid);

async function expensesOf(tenantId: string, id: string, tx?: Tx) {
  const q = tcol(tenantId, 'projects').doc(id).collection('expenses');
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.map((d) => docData<ExpenseRequest>(d)).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
}

function stats(rec: FinanceProject, expenses: ExpenseRequest[]) {
  const s = summarizeFinance(rec.budgetLines ?? [], expenses, rec.contract?.valueVnd ?? 0);
  return { contractValueVnd: s.contractValueVnd, approvedVnd: s.approvedVnd, disbursedVnd: s.disbursedVnd, settlement: rec.settlement?.status ?? 'NOT_STARTED' };
}

/**
 * Thay đổi tài chính trong transaction: đọc đề tài + đề nghị chi, áp dụng, cập nhật thống kê tài chính trên đề tài.
 */
async function mutate<R>(
  p: Principal,
  rid: string,
  id: string,
  action: string,
  fn: (tx: Tx, rec: FinanceProject, expenses: ExpenseRequest[]) => { result: R; patch?: Record<string, unknown>; expenses?: ExpenseRequest[]; detail?: string },
): Promise<R> {
  const ref = tcol(p.tenantId, 'projects').doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const rec = docData<FinanceProject>(snap);
    if (!canRead(p, rec)) throw notFound();
    const expenses = await expensesOf(p.tenantId, id, tx);
    const out = fn(tx, rec, expenses);
    const next = { ...rec, ...(out.patch ?? {}) } as FinanceProject;
    tx.update(ref, { ...(out.patch ?? {}), financeStats: stats(next, out.expenses ?? expenses), updatedAt: nowIso(), updatedBy: p.uid, version: rec.version + 1 });
    audit({ actor: p, action: `finance.${action}`, resourceType: 'project', resourceId: id, resourceVersion: rec.version + 1, requestId: rid, detail: out.detail ?? null }, tx);
    return out.result;
  });
}

@Controller('projects')
export class FinanceController {
  @Get(':id/finance')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const snap = await tcol(p.tenantId, 'projects').doc(id).get();
    if (!snap.exists) throw notFound();
    const rec = docData<FinanceProject>(snap);
    if (!canRead(p, rec)) throw notFound();
    const expenses = await expensesOf(p.tenantId, id);
    return {
      contract: rec.contract ?? null,
      budgetLines: rec.budgetLines ?? [],
      budgetLocked: !!rec.budgetLocked,
      settlement: rec.settlement ?? { status: 'NOT_STARTED', note: null, updatedAt: null, updatedByName: null },
      expenses,
      summary: summarizeFinance(rec.budgetLines ?? [], expenses, rec.contract?.valueVnd ?? 0),
      proposedBudgetVnd: rec.budgetVnd,
      permissions: {
        isOffice: isOffice(p, rec),
        isTeam: isTeam(p, rec),
        canEditBudget: isOffice(p, rec) || (rec.ownerUid === p.uid && !rec.budgetLocked),
        canRequest: isTeam(p, rec) && rec.status === 'ACTIVE' && !!rec.budgetLocked,
      },
      note: 'Số giải ngân, quyết toán do Phòng KH nhập theo chứng từ của Phòng Tài chính; hệ thống không tự suy ra.',
    };
  }

  @Put(':id/finance/contract')
  async contract(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ contractNo: z.string().min(1).max(100), signedDate: dateStr, valueVnd: money, fundingSource: z.string().max(200).nullable().optional(), note: z.string().max(2000).nullable().optional() }), body);
    return mutate(p, rid, id, 'contract', (_tx, rec) => {
      if (!isOffice(p, rec)) throw forbidden('Chỉ Phòng quản lý khoa học cập nhật hợp đồng.');
      const contract: ProjectContract = { contractNo: b.contractNo.trim(), signedDate: b.signedDate, valueVnd: b.valueVnd, fundingSource: b.fundingSource ?? null, note: b.note ?? null, updatedAt: nowIso(), updatedByName: p.displayName };
      return { result: { contract }, patch: { contract }, detail: `${contract.contractNo}: ${contract.valueVnd}` };
    });
  }

  @Put(':id/finance/budget')
  async budget(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ lines: z.array(z.object({ category, amountVnd: money, note: z.string().max(500).nullable().optional() })).max(30), lock: z.boolean().optional() }), body);
    return mutate(p, rid, id, b.lock ? 'budget_lock' : 'budget', (_tx, rec, expenses) => {
      const office = isOffice(p, rec);
      if (!office && !(rec.ownerUid === p.uid && !rec.budgetLocked)) throw forbidden('Dự toán đã được Phòng KH chốt; chỉ Phòng KH được điều chỉnh.');
      if (b.lock !== undefined && !office) throw forbidden('Chỉ Phòng KH được chốt dự toán.');
      const lines: BudgetLine[] = b.lines.filter((l) => l.amountVnd > 0).map((l) => ({ category: l.category, amountVnd: l.amountVnd, note: l.note?.trim() || null }));
      const total = lines.reduce((s, l) => s + l.amountVnd, 0);
      if (rec.contract && total > rec.contract.valueVnd) throw unprocessable('BUDGET_EXCEEDS_CONTRACT', 'Tổng dự toán vượt giá trị hợp đồng.');
      if (!rec.contract && rec.budgetVnd && total > rec.budgetVnd) throw unprocessable('BUDGET_EXCEEDS_APPROVED', 'Tổng dự toán vượt kinh phí đã phê duyệt.');
      const s = summarizeFinance(lines, expenses, 0);
      const over = s.byCategory.find((c) => c.approvedVnd > c.budgetVnd);
      if (over) throw unprocessable('BUDGET_BELOW_APPROVED', `Mục "${over.label}" thấp hơn số đã duyệt chi.`);
      return { result: { lines, locked: b.lock ?? !!rec.budgetLocked }, patch: { budgetLines: lines, ...(b.lock !== undefined ? { budgetLocked: b.lock } : {}) }, detail: `tổng ${total}` };
    });
  }

  @Post(':id/finance/expenses')
  async request(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ category, content: z.string().min(3).max(1000), amountVnd: money.refine((v) => v > 0, 'Số tiền phải lớn hơn 0') }), body);
    const expRef = tcol(p.tenantId, 'projects').doc(id).collection('expenses').doc();
    const out = await mutate(p, rid, id, 'expense_request', (tx, rec, expenses) => {
      if (!isTeam(p, rec)) throw forbidden('Chỉ thành viên đề tài được lập đề nghị chi.');
      if (rec.status !== 'ACTIVE') throw conflict('INVALID_STATE', 'Chỉ lập đề nghị chi khi đề tài đang thực hiện.');
      if (!rec.budgetLocked) throw conflict('BUDGET_NOT_LOCKED', 'Dự toán chưa được Phòng KH chốt.');
      const line = (rec.budgetLines ?? []).filter((l) => l.category === b.category).reduce((s, l) => s + l.amountVnd, 0);
      const used = expenses.filter((e) => e.category === b.category && e.status !== 'REJECTED').reduce((s, e) => s + e.amountVnd, 0);
      if (used + b.amountVnd > line) throw unprocessable('OVER_BUDGET', `Vượt dự toán mục "${BUDGET_CATEGORIES[b.category]}": còn ${(line - used).toLocaleString('vi-VN')} ₫.`);
      const e: Omit<ExpenseRequest, 'id'> = {
        category: b.category,
        content: b.content.trim(),
        amountVnd: b.amountVnd,
        status: 'PENDING',
        requestedBy: p.uid,
        requestedByName: p.displayName,
        requestedAt: nowIso(),
        decidedByName: null,
        decidedAt: null,
        decisionNote: null,
        disbursedVnd: null,
        disbursedAt: null,
        voucherNo: null,
      };
      tx.set(expRef, e);
      return { result: { id: expRef.id, rec }, expenses: [...expenses, { id: expRef.id, ...e }], detail: `${b.category}: ${b.amountVnd}` };
    });
    const office = await holdersOf(p.tenantId, SCIENCE_OFFICE, out.rec.unitPath);
    await notify(p.tenantId, office, { title: 'Đề nghị chi chờ duyệt', body: `${out.rec.code}: ${b.content.slice(0, 80)}`, link: `/projects/${id}` }).catch(() => undefined);
    return { id: out.id };
  }

  /** approve / reject (Phòng KH) · disburse: ghi nhận giải ngân theo chứng từ tài chính. */
  @Post(':id/finance/expenses/:eid/:action')
  async decide(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Param('eid') eid: string, @Param('action') action: string, @Body() body: unknown) {
    const b = parse(z.object({ note: z.string().max(1000).optional(), disbursedVnd: money.optional(), disbursedAt: dateStr.optional(), voucherNo: z.string().max(100).optional() }), body);
    const expRef = tcol(p.tenantId, 'projects').doc(id).collection('expenses').doc(eid);
    const out = await mutate(p, rid, id, `expense_${action}`, (tx, rec, expenses) => {
      if (!isOffice(p, rec)) throw forbidden('Chỉ Phòng quản lý khoa học xử lý đề nghị chi.');
      const e = expenses.find((x) => x.id === eid);
      if (!e) throw notFound('Không tìm thấy đề nghị chi.');
      let patch: Partial<ExpenseRequest>;
      if (action === 'approve' || action === 'reject') {
        if (e.status !== 'PENDING') throw conflict('INVALID_STATE', 'Đề nghị đã được xử lý.');
        if (e.requestedBy === p.uid) throw forbidden('Không tự duyệt đề nghị của chính mình.', 'SELF_REVIEW');
        if (action === 'reject' && !b.note?.trim()) throw badRequest('Cần ghi lý do không duyệt.');
        patch = { status: action === 'approve' ? 'APPROVED' : 'REJECTED', decidedByName: p.displayName, decidedAt: nowIso(), decisionNote: b.note ?? null };
      } else if (action === 'disburse') {
        if (e.status !== 'APPROVED') throw conflict('INVALID_STATE', 'Chỉ ghi nhận giải ngân cho đề nghị đã duyệt.');
        if (b.disbursedVnd === undefined || !b.disbursedAt || !b.voucherNo?.trim()) throw badRequest('Cần số tiền, ngày và số chứng từ giải ngân.');
        if (b.disbursedVnd > e.amountVnd) throw unprocessable('OVER_APPROVED', 'Số giải ngân vượt số đã duyệt.');
        patch = { status: 'DISBURSED', disbursedVnd: b.disbursedVnd, disbursedAt: b.disbursedAt, voucherNo: b.voucherNo.trim() };
      } else throw notFound();
      tx.update(expRef, patch);
      const next = expenses.map((x) => (x.id === eid ? { ...x, ...patch } : x));
      return { result: { e, rec, status: patch.status }, expenses: next, detail: `${eid}` };
    });
    await notify(p.tenantId, [out.e.requestedBy], { title: `Đề nghị chi: ${out.status === 'APPROVED' ? 'đã duyệt' : out.status === 'REJECTED' ? 'không duyệt' : 'đã giải ngân'}`, body: `${out.rec.code}: ${out.e.content.slice(0, 80)}`, link: `/projects/${id}` }).catch(() => undefined);
    return { id: eid, status: out.status };
  }

  @Put(':id/finance/settlement')
  async settlement(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(Object.keys(SETTLEMENT_LABELS) as [SettlementStatus, ...SettlementStatus[]]), note: z.string().max(2000).nullable().optional() }), body);
    return mutate(p, rid, id, 'settlement', (_tx, rec, expenses) => {
      if (!isOffice(p, rec)) throw forbidden('Chỉ Phòng quản lý khoa học cập nhật quyết toán.');
      if (b.status === 'SETTLED' && expenses.some((e) => e.status === 'PENDING' || e.status === 'APPROVED')) throw unprocessable('OPEN_EXPENSES', 'Còn đề nghị chi chưa xử lý xong / chưa giải ngân.');
      const settlement = { status: b.status, note: b.note ?? null, updatedAt: nowIso(), updatedByName: p.displayName };
      return { result: settlement, patch: { settlement }, detail: b.status };
    });
  }
}
