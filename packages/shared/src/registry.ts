/**
 * Danh mục kê khai – xác nhận (M09 nhóm nghiên cứu, M12 hội thảo, M13 sở hữu trí tuệ / chuyển giao, giải thưởng).
 * Mỗi loại có cùng quy trình: người kê khai lập Nháp → Nộp → Phòng KH Xác nhận hoặc Trả bổ sung.
 * Trường `hemis` cho biết cột tương ứng khi xuất sang HEMIS qua UNI-DATA360.
 */

export type RegistryFieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'year' | 'select' | 'boolean' | 'people' | 'person';

export interface RegistryField {
  key: string;
  label: string;
  type: RegistryFieldType;
  required?: boolean;
  options?: Record<string, string>;
  help?: string;
  /** Hiển thị trong bảng danh sách. */
  list?: boolean;
  hemis?: string;
}

export interface RegistryDef {
  kind: RegistryKind;
  label: string;
  plural: string;
  icon: string;
  description: string;
  /** Trường dùng làm tiêu đề bản ghi. */
  titleField: string;
  /** Trường liệt kê người trong trường liên quan (thành viên, tác giả, người nhận giải) — dùng cho hồ sơ khoa học. */
  peopleField: string;
  peopleLabel: string;
  hemisTable: string | null;
  fields: RegistryField[];
}

export const REGISTRY_KINDS = ['research_group', 'ip_asset', 'tech_transfer', 'conference', 'award'] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

export const REGISTRY_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Chờ xác nhận',
  NEEDS_REVISION: 'Cần bổ sung',
  CONFIRMED: 'Đã xác nhận',
};

export const REGISTRY: Record<RegistryKind, RegistryDef> = {
  research_group: {
    kind: 'research_group',
    label: 'Nhóm nghiên cứu',
    plural: 'Nhóm nghiên cứu',
    icon: '👥',
    description: 'Nhóm nghiên cứu và nhóm nghiên cứu mạnh: trưởng nhóm, thành viên, hướng nghiên cứu, quyết định công nhận.',
    titleField: 'name',
    peopleField: 'members',
    peopleLabel: 'Thành viên',
    hemisTable: '_KHCN_NHOM_NGHIEN_CUU',
    fields: [
      { key: 'name', label: 'Tên nhóm', type: 'text', required: true, list: true, hemis: 'TEN_NHOM' },
      { key: 'leader', label: 'Trưởng nhóm', type: 'person', required: true, list: true, hemis: 'TRUONG_NHOM' },
      { key: 'members', label: 'Thành viên', type: 'people', hemis: 'THANH_VIEN' },
      { key: 'field', label: 'Lĩnh vực', type: 'select', options: { NATURAL: 'Khoa học tự nhiên', ENGINEERING: 'Khoa học kỹ thuật và công nghệ', MEDICAL: 'Khoa học y, dược', AGRICULTURE: 'Khoa học nông nghiệp', SOCIAL: 'Khoa học xã hội', HUMANITIES: 'Khoa học nhân văn' }, list: true, hemis: 'LINH_VUC' },
      { key: 'direction', label: 'Hướng nghiên cứu', type: 'textarea', required: true },
      { key: 'isStrong', label: 'Nhóm nghiên cứu mạnh', type: 'boolean', list: true, hemis: 'NHOM_MANH' },
      { key: 'decisionNo', label: 'Số quyết định công nhận', type: 'text', hemis: 'SO_QUYET_DINH' },
      { key: 'establishedDate', label: 'Ngày thành lập', type: 'date', hemis: 'NGAY_THANH_LAP' },
      { key: 'externalMembers', label: 'Thành viên ngoài trường', type: 'textarea', help: 'Mỗi dòng: họ tên – cơ quan' },
    ],
  },
  ip_asset: {
    kind: 'ip_asset',
    label: 'Tài sản trí tuệ',
    plural: 'Sở hữu trí tuệ',
    icon: '💡',
    description: 'Sáng chế, giải pháp hữu ích, kiểu dáng công nghiệp, nhãn hiệu, quyền tác giả, giống cây trồng.',
    titleField: 'title',
    peopleField: 'inventors',
    peopleLabel: 'Tác giả / tác giả sáng chế',
    hemisTable: '_KHCN_SANG_CHE',
    fields: [
      { key: 'title', label: 'Tên đối tượng', type: 'text', required: true, list: true, hemis: 'TEN_SANG_CHE' },
      { key: 'ipType', label: 'Loại', type: 'select', required: true, list: true, options: { PATENT: 'Sáng chế', UTILITY: 'Giải pháp hữu ích', DESIGN: 'Kiểu dáng công nghiệp', TRADEMARK: 'Nhãn hiệu', COPYRIGHT: 'Quyền tác giả', PLANT: 'Giống cây trồng', OTHER: 'Khác' }, hemis: 'LOAI_SANG_CHE' },
      { key: 'inventors', label: 'Tác giả', type: 'people', hemis: 'TAC_GIA' },
      { key: 'ipStatus', label: 'Tình trạng', type: 'select', required: true, list: true, options: { FILED: 'Đã nộp đơn', ACCEPTED: 'Đơn hợp lệ', GRANTED: 'Đã cấp văn bằng', REJECTED: 'Bị từ chối', EXPIRED: 'Hết hiệu lực' }, hemis: 'TINH_TRANG' },
      { key: 'applicationNo', label: 'Số đơn', type: 'text', hemis: 'SO_DON' },
      { key: 'filingDate', label: 'Ngày nộp đơn', type: 'date', hemis: 'NGAY_NOP_DON' },
      { key: 'grantNo', label: 'Số văn bằng', type: 'text', list: true, hemis: 'SO_VAN_BANG' },
      { key: 'grantDate', label: 'Ngày cấp', type: 'date', hemis: 'NGAY_CAP' },
      { key: 'authority', label: 'Cơ quan cấp', type: 'text', help: 'vd: Cục Sở hữu trí tuệ, USPTO', hemis: 'CO_QUAN_CAP' },
      { key: 'owner', label: 'Chủ sở hữu', type: 'text', help: 'Mặc định là Trường' },
      { key: 'projectCode', label: 'Từ đề tài (mã)', type: 'text', hemis: 'MA_NHIEM_VU_NCKH' },
    ],
  },
  tech_transfer: {
    kind: 'tech_transfer',
    label: 'Hợp đồng chuyển giao',
    plural: 'Chuyển giao công nghệ',
    icon: '🤝',
    description: 'Hợp đồng chuyển giao công nghệ, li-xăng, dịch vụ KH&CN với doanh nghiệp, địa phương.',
    titleField: 'title',
    peopleField: 'staff',
    peopleLabel: 'Cán bộ thực hiện',
    hemisTable: '_KHCN_CHUYEN_GIAO',
    fields: [
      { key: 'title', label: 'Tên hợp đồng / sản phẩm chuyển giao', type: 'text', required: true, list: true, hemis: 'TEN_HOP_DONG' },
      { key: 'transferType', label: 'Hình thức', type: 'select', required: true, list: true, options: { TRANSFER: 'Chuyển giao công nghệ', LICENSE: 'Li-xăng', SERVICE: 'Dịch vụ KH&CN', CONSULTING: 'Tư vấn', OTHER: 'Khác' }, hemis: 'HINH_THUC' },
      { key: 'partner', label: 'Bên nhận', type: 'text', required: true, list: true, hemis: 'BEN_NHAN' },
      { key: 'contractNo', label: 'Số hợp đồng', type: 'text', hemis: 'SO_HOP_DONG' },
      { key: 'signedDate', label: 'Ngày ký', type: 'date', hemis: 'NGAY_KY' },
      { key: 'valueVnd', label: 'Giá trị (VND)', type: 'money', list: true, hemis: 'GIA_TRI' },
      { key: 'staff', label: 'Cán bộ thực hiện', type: 'people' },
      { key: 'ipRef', label: 'Tài sản trí tuệ liên quan', type: 'text', help: 'Số văn bằng / số đơn' },
      { key: 'projectCode', label: 'Từ đề tài (mã)', type: 'text', hemis: 'MA_NHIEM_VU_NCKH' },
    ],
  },
  conference: {
    kind: 'conference',
    label: 'Hội thảo',
    plural: 'Hội thảo khoa học',
    icon: '🎤',
    description: 'Hội thảo, hội nghị khoa học do Trường / đơn vị tổ chức hoặc đồng tổ chức.',
    titleField: 'name',
    peopleField: 'organizers',
    peopleLabel: 'Ban tổ chức',
    hemisTable: '_KHCN_HOI_THAO',
    fields: [
      { key: 'name', label: 'Tên hội thảo', type: 'text', required: true, list: true, hemis: 'TEN_HOI_THAO' },
      { key: 'confLevel', label: 'Cấp', type: 'select', required: true, list: true, options: { INTERNATIONAL: 'Quốc tế', NATIONAL: 'Quốc gia', UNIVERSITY: 'Cấp trường', UNIT: 'Cấp khoa / viện' }, hemis: 'CAP_HOI_THAO' },
      { key: 'startDate', label: 'Ngày tổ chức', type: 'date', required: true, list: true, hemis: 'NGAY_TO_CHUC' },
      { key: 'location', label: 'Địa điểm', type: 'text', hemis: 'DIA_DIEM' },
      { key: 'coOrganizers', label: 'Đơn vị đồng tổ chức', type: 'text' },
      { key: 'organizers', label: 'Ban tổ chức', type: 'people' },
      { key: 'papers', label: 'Số báo cáo / bài tham luận', type: 'number', list: true, hemis: 'SO_BAI' },
      { key: 'participants', label: 'Số đại biểu', type: 'number', hemis: 'SO_DAI_BIEU' },
      { key: 'proceedingsIsbn', label: 'ISBN kỷ yếu', type: 'text' },
      { key: 'budgetVnd', label: 'Kinh phí (VND)', type: 'money' },
    ],
  },
  award: {
    kind: 'award',
    label: 'Giải thưởng',
    plural: 'Giải thưởng KH&CN',
    icon: '🏆',
    description: 'Giải thưởng khoa học, sáng tạo của cán bộ, sinh viên (trong nước, quốc tế).',
    titleField: 'title',
    peopleField: 'recipients',
    peopleLabel: 'Người nhận giải',
    hemisTable: '_KHCN_GIAI_THUONG',
    fields: [
      { key: 'title', label: 'Tên giải thưởng', type: 'text', required: true, list: true, hemis: 'TEN_GIAI_THUONG' },
      { key: 'awardLevel', label: 'Cấp', type: 'select', required: true, list: true, options: { INTERNATIONAL: 'Quốc tế', NATIONAL: 'Quốc gia', MINISTRY: 'Bộ / Tỉnh', UNIVERSITY: 'Cấp trường' }, hemis: 'CAP_GIAI' },
      { key: 'rank', label: 'Hạng / mức giải', type: 'text', list: true, help: 'vd: Giải Nhất, Huy chương Vàng' },
      { key: 'organization', label: 'Cơ quan trao giải', type: 'text', required: true, hemis: 'CO_QUAN_TRAO' },
      { key: 'year', label: 'Năm', type: 'year', required: true, list: true, hemis: 'NAM' },
      { key: 'recipients', label: 'Người nhận giải', type: 'people', hemis: 'NGUOI_NHAN' },
      { key: 'work', label: 'Công trình được giải', type: 'text' },
      { key: 'decisionNo', label: 'Số quyết định', type: 'text' },
    ],
  },
};

export interface PersonRef {
  uid: string | null;
  name: string;
}

export interface RegistryItem {
  id: string;
  tenantId: string;
  kind: RegistryKind;
  code: string;
  title: string;
  data: Record<string, unknown>;
  personUids: string[];
  ownerUid: string;
  ownerName: string;
  unitId: string;
  unitPath: string[];
  unitName: string;
  status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_REVISION' | 'CONFIRMED';
  reviewNote: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Kiểm tra dữ liệu theo định nghĩa; trả danh sách lỗi tiếng Việt. */
export function validateRegistry(def: RegistryDef, data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const f of def.fields) {
    const v = data[f.key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) errors.push(`Thiếu "${f.label}".`);
      continue;
    }
    switch (f.type) {
      case 'number':
      case 'money':
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`"${f.label}" phải là số không âm.`);
        break;
      case 'year':
        if (typeof v !== 'number' || v < 1950 || v > 2100) errors.push(`"${f.label}" không hợp lệ.`);
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`"${f.label}" phải có dạng YYYY-MM-DD.`);
        break;
      case 'select':
        if (typeof v !== 'string' || !f.options || !(v in f.options)) errors.push(`"${f.label}" không thuộc danh mục.`);
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors.push(`"${f.label}" không hợp lệ.`);
        break;
      case 'person':
        if (typeof v !== 'object' || Array.isArray(v) || !(v as PersonRef).name) errors.push(`"${f.label}" cần họ tên.`);
        break;
      case 'people':
        if (!Array.isArray(v) || v.some((x) => !x || typeof (x as PersonRef).name !== 'string' || !(x as PersonRef).name)) errors.push(`"${f.label}" không hợp lệ.`);
        break;
      default:
        if (typeof v !== 'string' || v.length > 5000) errors.push(`"${f.label}" không hợp lệ.`);
    }
  }
  const extra = Object.keys(data).filter((k) => !def.fields.some((f) => f.key === k));
  if (extra.length) errors.push(`Trường không thuộc biểu mẫu: ${extra.join(', ')}.`);
  return errors;
}

/** Người trong trường được nêu trong bản ghi (uid), để hiển thị ở hồ sơ khoa học. */
export function registryPersonUids(def: RegistryDef, data: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const f of def.fields) {
    const v = data[f.key];
    if (f.type === 'person' && v && (v as PersonRef).uid) out.add((v as PersonRef).uid!);
    if (f.type === 'people' && Array.isArray(v)) for (const x of v as PersonRef[]) if (x.uid) out.add(x.uid);
  }
  return [...out];
}

/** Giá trị hiển thị dạng chữ của một trường. */
export function registryDisplay(f: RegistryField, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  switch (f.type) {
    case 'select':
      return f.options?.[String(v)] ?? String(v);
    case 'boolean':
      return v ? 'Có' : 'Không';
    case 'money':
      return new Intl.NumberFormat('vi-VN').format(Number(v)) + ' ₫';
    case 'person':
      return (v as PersonRef).name;
    case 'people':
      return (v as PersonRef[]).map((x) => x.name).join('; ');
    case 'date':
      return String(v).split('-').reverse().join('/');
    default:
      return String(v);
  }
}
