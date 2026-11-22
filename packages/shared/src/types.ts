import type { RoleBinding } from './authz';
import type { JournalScope, ProjectHemis, Quartile } from './hemis';
import type { Role } from './roles';

export type Classification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface BaseDoc {
  id: string;
  tenantId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export type UnitType = 'UNIVERSITY' | 'CAMPUS' | 'FACULTY' | 'INSTITUTE' | 'OFFICE' | 'DEPARTMENT';

export interface Unit {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  parentId: string | null;
  ancestorIds: string[];
}

export interface Person {
  uid: string;
  displayName: string;
  email: string;
  unitId: string | null;
  title?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  externalIds?: Record<string, string>;
}

export interface MeResponse {
  uid: string;
  displayName: string;
  email: string | null;
  tenantId: string;
  tenantName: string;
  tenants: { id: string; name: string }[];
  unitId: string | null;
  unitName: string | null;
  roles: Role[];
  bindings: RoleBinding[];
}

export type FormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
  help?: string;
  maxLength?: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
}

export interface CallForm {
  version: number;
  fields: FormField[];
  checklist: ChecklistItem[];
}

export interface Call extends BaseDoc {
  code: string;
  title: string;
  description: string;
  year: number;
  level: 'UNIVERSITY' | 'UNIT' | 'STUDENT';
  openAt: string;
  closeAt: string;
  eligibility: string;
  expertReview: boolean;
  form: CallForm;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
}

export interface WorkflowHistoryEntry {
  id: string;
  action: string;
  actionLabel: string;
  from: string;
  to: string;
  actorUid: string;
  actorName: string;
  comment: string | null;
  at: string;
  revisionNo?: number | null;
}

export interface ProposalMember {
  uid: string | null;
  name: string;
  role: 'PI' | 'MEMBER' | 'SECRETARY';
  unitName?: string | null;
}

export interface Proposal extends BaseDoc {
  code: string;
  callId: string;
  callCode: string;
  callTitle: string;
  formVersion: number;
  workflowKey: 'proposal';
  workflowVersion: number;
  title: string;
  ownerUid: string;
  ownerName: string;
  unitId: string;
  unitPath: string[];
  unitName: string;
  members: ProposalMember[];
  memberUids: string[];
  fields: Record<string, string | number | null>;
  budgetVnd: number | null;
  durationMonths: number | null;
  status: string;
  returnTo: string | null;
  actorsByAction: Record<string, string>;
  currentRevisionNo: number;
  submittedAt: string | null;
  decidedAt: string | null;
  projectId: string | null;
  expertReview: boolean;
  classification: Classification;
  /** NCKH sinh viên: giảng viên hướng dẫn phải xác nhận trước khi nộp. */
  callLevel?: 'UNIVERSITY' | 'UNIT' | 'STUDENT';
  supervisor?: { uid: string; name: string; confirmedAt: string | null; note: string | null } | null;
  major?: string | null;
  cohort?: string | null;
}

export interface ProposalRevision {
  revisionNo: number;
  submittedAt: string;
  submittedBy: string;
  snapshot: Pick<Proposal, 'title' | 'members' | 'fields' | 'budgetVnd' | 'durationMonths'> & { documentIds: string[] };
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  deliverable: string;
  status: 'OPEN' | 'SUBMITTED' | 'ACCEPTED';
  submittedAt: string | null;
  submittedNote: string | null;
  documentIds: string[];
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface ChangeRequest {
  id: string;
  type: 'EXTENSION' | 'MEMBER' | 'BUDGET' | 'OTHER';
  reason: string;
  proposedEndDate: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface Project extends BaseDoc {
  code: string;
  proposalId: string;
  title: string;
  ownerUid: string;
  ownerName: string;
  memberUids: string[];
  members: ProposalMember[];
  unitId: string;
  unitPath: string[];
  unitName: string;
  budgetVnd: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  workflowKey: 'project';
  workflowVersion: number;
  actorsByAction: Record<string, string>;
  returnTo: string | null;
  milestoneStats: { total: number; accepted: number; open?: number; nextDue: string | null };
  hemis?: ProjectHemis | null;
  callLevel?: 'UNIVERSITY' | 'UNIT' | 'STUDENT';
  supervisor?: { uid: string; name: string } | null;
  major?: string | null;
  cohort?: string | null;
  /** Tóm tắt tài chính (cập nhật khi ghi nhận hợp đồng / giải ngân). */
  financeStats?: { contractValueVnd: number; approvedVnd: number; disbursedVnd: number; settlement: string } | null;
}

export interface PublicationAuthor {
  name: string;
  uid: string | null;
  isInternal: boolean;
  order: number;
}

export type PublicationType = 'JOURNAL' | 'CONFERENCE' | 'BOOK' | 'BOOK_CHAPTER' | 'OTHER';

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  JOURNAL: 'Bài báo tạp chí',
  CONFERENCE: 'Bài hội thảo',
  BOOK: 'Sách',
  BOOK_CHAPTER: 'Chương sách',
  OTHER: 'Khác',
};

export interface Publication extends BaseDoc {
  code: string;
  title: string;
  titleNormalized: string;
  type: PublicationType;
  venue: string;
  year: number;
  doi: string | null;
  doiNormalized: string | null;
  indexing: string[];
  authors: PublicationAuthor[];
  authorUids: string[];
  ownerUid: string;
  ownerName: string;
  unitId: string;
  unitPath: string[];
  unitName: string;
  projectId: string | null;
  url: string | null;
  /** Thông tin theo HEMIS. Xếp hạng Q và phạm vi tạp chí do Phòng KH xác nhận theo nguồn — AI không tự kết luận. */
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  issn?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  journalScope?: JournalScope | null;
  quartile?: Quartile | null;
  quartileSource?: string | null;
  status: string;
  workflowKey: 'publication';
  workflowVersion: number;
  actorsByAction: Record<string, string>;
  returnTo: string | null;
}

export interface DocumentMeta {
  id: string;
  tenantId: string;
  parentType: 'proposal' | 'project' | 'publication' | 'registry';
  parentId: string;
  checklistKey: string | null;
  milestoneId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  classification: Classification;
  status: 'ACTIVE' | 'REVOKED' | 'SUPERSEDED';
  /** Kho minh chứng có phiên bản: các phiên bản cùng nhóm, số tăng dần. */
  versionGroup?: string | null;
  versionNo?: number;
  supersededBy?: string | null;
  changeNote?: string | null;
}

export interface NotificationItem {
  id: string;
  uid: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorUid: string;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceVersion: number | null;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  requestId: string | null;
  detail: string | null;
}

export interface WorkItem {
  kind: 'proposal' | 'project' | 'publication' | 'milestone' | 'change_request' | 'council';
  id: string;
  code: string;
  title: string;
  status: string;
  statusLabel: string;
  actionHint: string;
  dueDate: string | null;
  link: string;
}

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Hồ sơ trả về kèm các thao tác người dùng hiện tại được phép làm. */
export interface WithActions<T> {
  item: T;
  actions: { action: string; label: string; requireComment: boolean; tone: string }[];
  canEdit: boolean;
}
