import { hasRoleFor, type Principal } from './authz';
import { LEADERSHIP, SCIENCE_OFFICE, UNIT_REVIEWERS, type Role } from './roles';

/**
 * Workflow engine thuần (không phụ thuộc DB) — dùng chung cho API (thực thi) và web (hiển thị).
 * Mọi quyết định cuối cùng chạy ở server; web chỉ dùng để gợi ý hiển thị.
 */

export type ActorRule = {
  /** Chủ hồ sơ (người tạo / chủ nhiệm) được thực hiện. */
  owner?: boolean;
  /** Vai trò được thực hiện, áp dụng theo phạm vi đơn vị của hồ sơ (vai trò cấp trường luôn áp dụng). */
  roles?: Role[];
};

export interface TransitionDef {
  action: string;
  label: string;
  from: string[];
  /** Trạng thái đích; '$RETURN' = quay lại bước đã lưu khi trả bổ sung. */
  to: string;
  actor: ActorRule;
  /** Điều kiện cờ cấu hình (vd: 'expertReview' hoặc '!expertReview'). */
  when?: string;
  requireComment?: boolean;
  /** Không cho chủ hồ sơ tự thực hiện (chống tự duyệt). */
  forbidOwner?: boolean;
  /** Không cho người đã thực hiện các action này thực hiện tiếp (phân tách nhiệm vụ). */
  forbidSameActorAs?: string[];
  /** Ghi nhớ trạng thái hiện tại để quay lại sau khi nộp lại. */
  setsReturnTo?: boolean;
  /** Kiểu nút: primary | danger | default. */
  tone?: 'primary' | 'danger' | 'default';
}

export interface WorkflowDef {
  key: string;
  version: number;
  initial: string;
  states: Record<string, { label: string; terminal?: boolean }>;
  transitions: TransitionDef[];
}

export interface TransitionContext {
  principal: Pick<Principal, 'uid' | 'bindings'>;
  ownerUid: string;
  /** [unitId, ...ancestorIds] của hồ sơ. */
  unitPath: string[];
  flags?: Record<string, boolean>;
  returnTo?: string | null;
  /** uid người đã thực hiện mỗi action (lần gần nhất). */
  actorsByAction?: Record<string, string>;
  now?: Date;
}

export type DenyReason =
  | 'INVALID_STATE'
  | 'FORBIDDEN_ROLE'
  | 'SELF_APPROVAL'
  | 'SEPARATION_OF_DUTIES'
  | 'CONDITION_NOT_MET'
  | 'COMMENT_REQUIRED'
  | 'UNKNOWN_ACTION';

export const DENY_MESSAGES: Record<DenyReason, string> = {
  INVALID_STATE: 'Thao tác không hợp lệ ở trạng thái hiện tại của hồ sơ.',
  FORBIDDEN_ROLE: 'Bạn không có vai trò/phạm vi để thực hiện thao tác này.',
  SELF_APPROVAL: 'Không được tự xét duyệt hồ sơ của chính mình.',
  SEPARATION_OF_DUTIES: 'Thao tác phải do người khác với người đã xử lý bước trước thực hiện.',
  CONDITION_NOT_MET: 'Thao tác không áp dụng theo cấu hình quy trình.',
  COMMENT_REQUIRED: 'Cần nhập ý kiến / lý do.',
  UNKNOWN_ACTION: 'Thao tác không tồn tại trong quy trình.',
};

function conditionHolds(when: string | undefined, flags: Record<string, boolean> = {}): boolean {
  if (!when) return true;
  return when.startsWith('!') ? !flags[when.slice(1)] : !!flags[when];
}

export function checkTransition(
  def: WorkflowDef,
  state: string,
  action: string,
  ctx: TransitionContext,
  comment?: string | null,
): { ok: true; transition: TransitionDef; to: string } | { ok: false; reason: DenyReason } {
  const candidates = def.transitions.filter((t) => t.action === action);
  if (candidates.length === 0) return { ok: false, reason: 'UNKNOWN_ACTION' };
  const inState = candidates.filter((t) => t.from.includes(state));
  if (inState.length === 0) return { ok: false, reason: 'INVALID_STATE' };
  const t = inState.find((c) => conditionHolds(c.when, ctx.flags));
  if (!t) return { ok: false, reason: 'CONDITION_NOT_MET' };

  const uid = ctx.principal.uid;
  const isOwner = uid === ctx.ownerUid;
  const byOwner = !!t.actor.owner && isOwner;
  const byRole = !!t.actor.roles && hasRoleFor(ctx.principal, t.actor.roles, ctx.unitPath, ctx.now);
  if (!byOwner && !byRole) return { ok: false, reason: 'FORBIDDEN_ROLE' };
  if (t.forbidOwner && isOwner) return { ok: false, reason: 'SELF_APPROVAL' };
  if (t.forbidSameActorAs?.some((a) => ctx.actorsByAction?.[a] === uid)) {
    return { ok: false, reason: 'SEPARATION_OF_DUTIES' };
  }
  if (t.requireComment && !comment?.trim()) return { ok: false, reason: 'COMMENT_REQUIRED' };

  let to = t.to;
  if (to === '$RETURN') {
    if (!ctx.returnTo) return { ok: false, reason: 'INVALID_STATE' };
    to = ctx.returnTo;
  }
  return { ok: true, transition: t, to };
}

/** Các thao tác người dùng được phép làm ngay bây giờ (bỏ qua yêu cầu nhập ý kiến). */
export function availableActions(def: WorkflowDef, state: string, ctx: TransitionContext): TransitionDef[] {
  const seen = new Set<string>();
  const result: TransitionDef[] = [];
  for (const t of def.transitions) {
    if (seen.has(t.action)) continue;
    const r = checkTransition(def, state, t.action, ctx, 'x');
    if (r.ok) {
      seen.add(t.action);
      result.push(r.transition);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Định nghĩa quy trình v1 (cấu hình mặc định — trường có thể thay bằng version mới)
// ---------------------------------------------------------------------------

const REVIEW_STATES = ['UNIT_REVIEW', 'SCIENCE_REVIEW', 'EXPERT_REVIEW', 'APPROVAL_PENDING'];

export const PROPOSAL_WORKFLOW: WorkflowDef = {
  key: 'proposal',
  version: 1,
  initial: 'DRAFT',
  states: {
    DRAFT: { label: 'Nháp' },
    UNIT_REVIEW: { label: 'Đơn vị xem xét' },
    SCIENCE_REVIEW: { label: 'Phòng KH xử lý' },
    EXPERT_REVIEW: { label: 'Thẩm định / phản biện' },
    APPROVAL_PENDING: { label: 'Chờ phê duyệt' },
    NEEDS_REVISION: { label: 'Cần bổ sung' },
    APPROVED: { label: 'Đã phê duyệt', terminal: true },
    REJECTED: { label: 'Không phê duyệt', terminal: true },
    WITHDRAWN: { label: 'Đã rút', terminal: true },
  },
  transitions: [
    { action: 'submit', label: 'Nộp hồ sơ', from: ['DRAFT'], to: 'UNIT_REVIEW', actor: { owner: true }, tone: 'primary' },
    { action: 'resubmit', label: 'Nộp lại', from: ['NEEDS_REVISION'], to: '$RETURN', actor: { owner: true }, tone: 'primary' },
    { action: 'withdraw', label: 'Rút hồ sơ', from: ['DRAFT', 'NEEDS_REVISION', 'UNIT_REVIEW'], to: 'WITHDRAWN', actor: { owner: true }, requireComment: true, tone: 'danger' },
    { action: 'unit_confirm', label: 'Đơn vị xác nhận', from: ['UNIT_REVIEW'], to: 'SCIENCE_REVIEW', actor: { roles: UNIT_REVIEWERS }, forbidOwner: true, tone: 'primary' },
    { action: 'science_forward', label: 'Chuyển thẩm định', from: ['SCIENCE_REVIEW'], to: 'EXPERT_REVIEW', when: 'expertReview', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, tone: 'primary' },
    { action: 'science_forward', label: 'Trình phê duyệt', from: ['SCIENCE_REVIEW'], to: 'APPROVAL_PENDING', when: '!expertReview', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, tone: 'primary' },
    { action: 'expert_complete', label: 'Ghi nhận kết quả thẩm định', from: ['EXPERT_REVIEW'], to: 'APPROVAL_PENDING', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, requireComment: true, tone: 'primary' },
    { action: 'approve', label: 'Phê duyệt', from: ['APPROVAL_PENDING'], to: 'APPROVED', actor: { roles: LEADERSHIP }, forbidOwner: true, forbidSameActorAs: ['science_forward', 'expert_complete'], tone: 'primary' },
    { action: 'request_revision', label: 'Trả bổ sung', from: REVIEW_STATES, to: 'NEEDS_REVISION', actor: { roles: [...UNIT_REVIEWERS, ...SCIENCE_OFFICE, ...LEADERSHIP] }, forbidOwner: true, requireComment: true, setsReturnTo: true },
    { action: 'reject', label: 'Không phê duyệt', from: REVIEW_STATES, to: 'REJECTED', actor: { roles: [...SCIENCE_OFFICE, ...LEADERSHIP] }, forbidOwner: true, requireComment: true, tone: 'danger' },
  ],
};

export const PROJECT_WORKFLOW: WorkflowDef = {
  key: 'project',
  version: 1,
  initial: 'CONTRACT_PENDING',
  states: {
    CONTRACT_PENDING: { label: 'Chờ ký hợp đồng / giao nhiệm vụ' },
    ACTIVE: { label: 'Đang thực hiện' },
    SUSPENDED: { label: 'Tạm dừng' },
    ACCEPTANCE_REQUESTED: { label: 'Đề nghị nghiệm thu' },
    ACCEPTANCE_REVIEW: { label: 'Đang nghiệm thu' },
    COMPLETION_REVISION: { label: 'Hoàn thiện sau nghiệm thu' },
    COMPLETED: { label: 'Đã hoàn thành' },
    ARCHIVED: { label: 'Đã lưu trữ', terminal: true },
    CANCELLED: { label: 'Đã hủy', terminal: true },
  },
  transitions: [
    { action: 'activate', label: 'Giao nhiệm vụ / bắt đầu', from: ['CONTRACT_PENDING'], to: 'ACTIVE', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, tone: 'primary' },
    { action: 'request_acceptance', label: 'Đề nghị nghiệm thu', from: ['ACTIVE'], to: 'ACCEPTANCE_REQUESTED', actor: { owner: true }, tone: 'primary' },
    { action: 'start_acceptance', label: 'Tiếp nhận nghiệm thu', from: ['ACCEPTANCE_REQUESTED'], to: 'ACCEPTANCE_REVIEW', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, tone: 'primary' },
    { action: 'return_acceptance', label: 'Trả lại đề nghị nghiệm thu', from: ['ACCEPTANCE_REQUESTED'], to: 'ACTIVE', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, requireComment: true },
    { action: 'request_completion_revision', label: 'Yêu cầu hoàn thiện', from: ['ACCEPTANCE_REVIEW'], to: 'COMPLETION_REVISION', actor: { roles: [...SCIENCE_OFFICE, ...LEADERSHIP] }, forbidOwner: true, requireComment: true },
    { action: 'resubmit_completion', label: 'Nộp bản hoàn thiện', from: ['COMPLETION_REVISION'], to: 'ACCEPTANCE_REVIEW', actor: { owner: true }, tone: 'primary' },
    { action: 'complete', label: 'Xác nhận hoàn thành', from: ['ACCEPTANCE_REVIEW'], to: 'COMPLETED', actor: { roles: ['SCIENCE_HEAD', ...LEADERSHIP] }, forbidOwner: true, forbidSameActorAs: ['start_acceptance'], tone: 'primary' },
    { action: 'archive', label: 'Lưu trữ', from: ['COMPLETED'], to: 'ARCHIVED', actor: { roles: SCIENCE_OFFICE } },
    { action: 'suspend', label: 'Tạm dừng', from: ['ACTIVE'], to: 'SUSPENDED', actor: { roles: LEADERSHIP }, forbidOwner: true, requireComment: true, tone: 'danger' },
    { action: 'resume', label: 'Tiếp tục thực hiện', from: ['SUSPENDED'], to: 'ACTIVE', actor: { roles: LEADERSHIP }, forbidOwner: true, requireComment: true },
    { action: 'cancel', label: 'Hủy đề tài', from: ['CONTRACT_PENDING', 'ACTIVE', 'SUSPENDED'], to: 'CANCELLED', actor: { roles: LEADERSHIP }, forbidOwner: true, requireComment: true, tone: 'danger' },
  ],
};

export const PUBLICATION_WORKFLOW: WorkflowDef = {
  key: 'publication',
  version: 1,
  initial: 'DRAFT',
  states: {
    DRAFT: { label: 'Nháp' },
    SUBMITTED: { label: 'Đã nộp' },
    VERIFIED: { label: 'Đã xác minh' },
    NEEDS_REVISION: { label: 'Cần bổ sung' },
    CONFIRMED: { label: 'Đã xác nhận' },
    EXPORTED: { label: 'Đã xuất dữ liệu', terminal: true },
    REJECTED: { label: 'Không xác nhận', terminal: true },
  },
  transitions: [
    { action: 'submit', label: 'Nộp xác nhận', from: ['DRAFT', 'NEEDS_REVISION'], to: 'SUBMITTED', actor: { owner: true }, tone: 'primary' },
    { action: 'verify', label: 'Xác minh minh chứng', from: ['SUBMITTED'], to: 'VERIFIED', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, tone: 'primary' },
    { action: 'request_revision', label: 'Trả bổ sung', from: ['SUBMITTED', 'VERIFIED'], to: 'NEEDS_REVISION', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, requireComment: true },
    { action: 'reject', label: 'Không xác nhận', from: ['SUBMITTED', 'VERIFIED'], to: 'REJECTED', actor: { roles: SCIENCE_OFFICE }, forbidOwner: true, requireComment: true, tone: 'danger' },
    { action: 'confirm', label: 'Xác nhận công bố', from: ['VERIFIED'], to: 'CONFIRMED', actor: { roles: ['SCIENCE_HEAD'] }, forbidOwner: true, forbidSameActorAs: ['verify'], tone: 'primary' },
    { action: 'mark_exported', label: 'Đánh dấu đã xuất', from: ['CONFIRMED'], to: 'EXPORTED', actor: { roles: SCIENCE_OFFICE } },
  ],
};

export const WORKFLOWS = {
  proposal: PROPOSAL_WORKFLOW,
  project: PROJECT_WORKFLOW,
  publication: PUBLICATION_WORKFLOW,
} as const;

export type WorkflowKey = keyof typeof WORKFLOWS;

export function stateLabel(key: WorkflowKey, state: string): string {
  return WORKFLOWS[key].states[state]?.label ?? state;
}
