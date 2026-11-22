import type { Principal, Project, Publication } from '@aisrm/shared';
import { createHash } from 'node:crypto';
import { db, nowIso, tcol } from '../infra';

/**
 * UNI-DATA360 GIẢ LẬP. Đóng vai hệ thống bên ngoài để kiểm thử luồng tích hợp khi chưa có hợp đồng API thật.
 * Dữ liệu của "UNI giả lập" nằm riêng trong `mockUniData360/{tenantId}` — không trộn với dữ liệu AI-SRM.
 * Hợp đồng sự kiện theo AI_SRM_BUILD_SPEC §7.3 (đề xuất); KHÔNG phải API thật của UNI-DATA360.
 */

export interface IntegrationSettings {
  mode: 'disabled' | 'mock' | 'live';
  /** Tỷ lệ lỗi giả lập (%) để kiểm thử retry/replay. */
  failureRatePct: number;
  updatedAt?: string;
}

export const DEFAULT_INTEGRATION: IntegrationSettings = { mode: 'mock', failureRatePct: 0 };

export async function loadIntegration(tenantId: string): Promise<IntegrationSettings> {
  const s = await tcol(tenantId, 'integrations').doc('uniData360').get();
  return { ...DEFAULT_INTEGRATION, ...(s.exists ? (s.data() as Partial<IntegrationSettings>) : {}) };
}

const mockRoot = (tenantId: string) => db().collection('mockUniData360').doc(tenantId);

export class MockUnavailable extends Error {}

export interface OutboundEvent {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  tenantId: string;
  sourceSystem: string;
  occurredAt: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  operation: 'upsert' | 'delete' | 'revoke';
  data: Record<string, unknown>;
}

/**
 * Điểm nhận sự kiện của UNI giả lập: idempotent theo eventId; phiên bản cũ không đè phiên bản mới.
 */
export async function mockReceive(tenantId: string, e: OutboundEvent, failureRatePct: number): Promise<'ACCEPTED' | 'DUPLICATE' | 'STALE_IGNORED'> {
  if (failureRatePct > 0 && Math.random() * 100 < failureRatePct) {
    throw new MockUnavailable('UNI-DATA360 (giả lập) tạm thời không phản hồi (lỗi được tiêm để kiểm thử).');
  }
  const root = mockRoot(tenantId);
  const inboxRef = root.collection('inbox').doc(e.eventId);
  const entityRef = root.collection('entities').doc(`${e.entityType}__${e.entityId}`);
  return db().runTransaction(async (tx) => {
    const [inbox, entity] = await Promise.all([tx.get(inboxRef), tx.get(entityRef)]);
    if (inbox.exists) return 'DUPLICATE';
    const receivedAt = nowIso();
    if (entity.exists && (entity.get('entityVersion') as number) >= e.entityVersion) {
      tx.set(inboxRef, { ...e, receivedAt, result: 'STALE_IGNORED' });
      return 'STALE_IGNORED';
    }
    tx.set(inboxRef, { ...e, receivedAt, result: 'ACCEPTED' });
    tx.set(entityRef, {
      entityType: e.entityType,
      entityId: e.entityId,
      entityVersion: e.entityVersion,
      operation: e.operation,
      data: e.data,
      updatedAt: receivedAt,
      uniId: `UNI-${e.entityType.toUpperCase()}-${e.entityId}`,
    });
    return 'ACCEPTED';
  });
}

export async function mockEntities(tenantId: string) {
  const snap = await mockRoot(tenantId).collection('entities').get();
  return snap.docs.map((d) => d.data() as { entityType: string; entityId: string; entityVersion: number; data: Record<string, unknown>; uniId: string });
}

/**
 * Danh mục gốc từ UNI giả lập (đơn vị, cán bộ). Được sinh từ dữ liệu hiện có của trường + vài khác biệt có chủ đích
 * (1 đơn vị đổi tên, 1 đơn vị mới, 1 cán bộ mới) để minh họa đối chiếu. Không phải dữ liệu thật.
 */
export async function mockMasterData(tenantId: string) {
  const [units, people] = await Promise.all([tcol(tenantId, 'units').get(), tcol(tenantId, 'people').get()]);
  const uniUnits = units.docs.map((d, i) => ({
    uniId: `UNI-UNIT-${d.get('code')}`,
    code: d.get('code') as string,
    name: i === 1 ? `${d.get('name')} (tên cập nhật từ UNI)` : (d.get('name') as string),
    parentCode: null as string | null,
  }));
  uniUnits.push({ uniId: 'UNI-UNIT-VKTS', code: 'VKTS', name: 'Viện Kinh tế số (mới trên UNI)', parentCode: 'FTU' });
  const uniPeople = people.docs
    .filter((d) => d.get('externalIds')?.uniData360)
    .map((d) => ({ uniId: d.get('externalIds').uniData360 as string, fullName: d.get('displayName') as string, unitCode: null as string | null, status: 'ACTIVE' }));
  uniPeople.push({ uniId: `MOCK-${tenantId}-new-staff`, fullName: 'Cán bộ mới (chỉ có trên UNI giả lập)', unitCode: 'KTQT', status: 'ACTIVE' });
  return { units: uniUnits, people: uniPeople };
}

// ---------------------------------------------------------------------------
// Ánh xạ sang chuẩn HEMIS (mục 12 — API đồng bộ dữ liệu NCKH). XEM TRƯỚC, chưa gửi HEMIS.
// ---------------------------------------------------------------------------

/** GUID ổn định từ mã nội bộ (HEMIS yêu cầu Id dạng Guid). */
export function stableGuid(...parts: string[]): string {
  const h = createHash('sha1').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface HemisRecord {
  table: string;
  sourceCode: string;
  record: Record<string, unknown>;
  missingRequired: string[];
  warnings: string[];
}

const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);

export function projectToHemis(tenantId: string, p: Project & { id: string; durationMonths?: number | null }, tenantName: string): HemisRecord {
  const record: Record<string, unknown> = {
    Id: stableGuid(tenantId, 'project', p.id),
    Created: ymd(p.createdAt),
    Modified: ymd(p.updatedAt),
    MA_NHIEM_VU: p.code,
    TEN_NHIEM_VU: p.title,
    PHAN_LOAI_NHIEM_VU: null,
    PHAN_CAP_NHIEM_VU: null,
    LINH_VUC_NCKH: null,
    CO_QUAN_CHU_QUAN: null,
    CO_QUAN_CHU_TRI: tenantName,
    NGUOI_CHU_TRI: p.ownerName,
    TG_BAT_DAU: p.startDate,
    TG_KET_THUC: p.endDate,
    NGUON_KINH_PHI: null,
    TONG_KINH_PHI: p.budgetVnd,
    TINH_TRANG_NV: null,
    DANH_GIA_NV: null,
  };
  const required = ['Id', 'Created', 'Modified', 'MA_NHIEM_VU', 'TEN_NHIEM_VU', 'TG_BAT_DAU'];
  return {
    table: '_KHCN_NHIEM_VU_KHCN',
    sourceCode: p.code,
    record,
    missingRequired: required.filter((k) => record[k] === null || record[k] === undefined || record[k] === ''),
    warnings: [
      'Chưa ánh xạ mã danh mục HEMIS: PHAN_LOAI_NHIEM_VU, PHAN_CAP_NHIEM_VU, LINH_VUC_NCKH, NGUON_KINH_PHI, TINH_TRANG_NV, DANH_GIA_NV.',
      `Trạng thái AI-SRM "${p.status}" cần bảng ánh xạ sang mã tình trạng nhiệm vụ HEMIS.`,
    ],
  };
}

export function publicationToHemis(tenantId: string, x: Publication & { id: string }, projectCode: string | null): HemisRecord {
  if (x.type === 'BOOK' || x.type === 'BOOK_CHAPTER') {
    const record: Record<string, unknown> = {
      Id: stableGuid(tenantId, 'publication', x.id),
      Created: ymd(x.createdAt),
      Modified: ymd(x.updatedAt),
      MA_NHIEM_VU_NCKH: projectCode,
      MA_TAI_LIEU: x.code,
      TEN_SACH: x.title,
      MA_LOAI_SACH: null,
      MA_ISBN: null,
      NHA_XUAT_BAN: x.venue || null,
      NAM_XUAT_BAN: x.year,
    };
    const required = ['Id', 'Created', 'Modified', 'MA_TAI_LIEU', 'TEN_SACH', 'MA_LOAI_SACH'];
    return {
      table: '_KHCH_SACH_XUAT_BAN',
      sourceCode: x.code,
      record,
      missingRequired: required.filter((k) => record[k] === null || record[k] === undefined || record[k] === ''),
      warnings: ['AI-SRM chưa có trường ISBN, số trang, mã loại sách (danh mục HEMIS) — cần bổ sung vào biểu mẫu công bố.'],
    };
  }
  const record: Record<string, unknown> = {
    Id: stableGuid(tenantId, 'publication', x.id),
    Created: ymd(x.createdAt),
    Modified: ymd(x.updatedAt),
    MA_NHIEM_VU_NCKH: projectCode,
    MA_BAI_BAO: x.code,
    TEN_BAI_BAO: x.title,
    TEN_TAP_CHI: x.venue || null,
    TAP_CHI_QUOC_TE: null,
    TAP_CHI_TRONG_NUOC: null,
    XEP_HANG_Q: null,
    TAP_SO: null,
    TRANG: null,
    NAM_CONG_BO: x.year,
  };
  const required = ['Id', 'Created', 'Modified', 'MA_BAI_BAO', 'TEN_BAI_BAO', 'NAM_CONG_BO'];
  return {
    table: '_KHCN_BAI_BAO_KHOA_HOC',
    sourceCode: x.code,
    record,
    missingRequired: required.filter((k) => record[k] === null || record[k] === undefined || record[k] === ''),
    warnings: [
      'Chưa có mã danh mục tạp chí quốc tế/trong nước và xếp hạng Q (HEMIS) — AI-SRM không tự kết luận Q/Scopus/WoS; cần cán bộ xác nhận theo nguồn.',
      'AI-SRM chưa có trường Tập/Số, Trang — cần bổ sung.',
    ],
  };
}

export type { Principal };
