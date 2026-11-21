/**
 * DỮ LIỆU GIẢ LẬP — chỉ dùng cho Firebase Emulator / môi trường thử.
 * Tên người, đơn vị, đề tài là hư cấu. Mật khẩu dưới đây là mật khẩu thử cho emulator, không dùng ở production.
 */
import type { Role, UnitType } from '@aisrm/shared';

export const DEMO_PASSWORD = 'Demo@12345';

export interface SeedUnit {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  parentId: string | null;
}

export interface SeedUser {
  key: string;
  email: string;
  displayName: string;
  title: string;
  unitId: string;
  roles: { role: Role; scope: 'tenant' | string }[];
}

export interface SeedTenant {
  id: string;
  name: string;
  units: SeedUnit[];
  users: SeedUser[];
}

export const TENANTS: SeedTenant[] = [
  {
    id: 'ftu',
    name: 'Trường Đại học Mẫu FTU (dữ liệu giả lập)',
    units: [
      { id: 'root', code: 'FTU', name: 'Trường Đại học Mẫu FTU', type: 'UNIVERSITY', parentId: null },
      { id: 'bgh', code: 'BGH', name: 'Ban Giám hiệu', type: 'OFFICE', parentId: 'root' },
      { id: 'p-qlkh', code: 'QLKH', name: 'Phòng Quản lý khoa học', type: 'OFFICE', parentId: 'root' },
      { id: 'cs-hn', code: 'CSHN', name: 'Trụ sở chính Hà Nội', type: 'CAMPUS', parentId: 'root' },
      { id: 'cs-hcm', code: 'CS2', name: 'Cơ sở II TP. Hồ Chí Minh', type: 'CAMPUS', parentId: 'root' },
      { id: 'cs-qn', code: 'CSQN', name: 'Cơ sở Quảng Ninh', type: 'CAMPUS', parentId: 'root' },
      { id: 'k-ktqt', code: 'KTQT', name: 'Khoa Kinh tế quốc tế', type: 'FACULTY', parentId: 'cs-hn' },
      { id: 'k-qtkd', code: 'QTKD', name: 'Khoa Quản trị kinh doanh', type: 'FACULTY', parentId: 'cs-hn' },
      { id: 'k-luat', code: 'LUAT', name: 'Khoa Luật', type: 'FACULTY', parentId: 'cs-hn' },
      { id: 'bm-cs2-kt', code: 'CS2-KT', name: 'Bộ môn Kinh tế – Cơ sở II', type: 'DEPARTMENT', parentId: 'cs-hcm' },
      { id: 'bm-qn-kd', code: 'QN-KD', name: 'Bộ môn Kinh doanh – Cơ sở Quảng Ninh', type: 'DEPARTMENT', parentId: 'cs-qn' },
    ],
    users: [
      { key: 'student', email: 'sv.an@demo.aisrm.test', displayName: 'Nguyễn Văn An', title: 'Sinh viên K62', unitId: 'k-ktqt', roles: [{ role: 'STUDENT', scope: 'tenant' }] },
      { key: 'pi', email: 'gv.binh@demo.aisrm.test', displayName: 'TS. Trần Thị Bình', title: 'Giảng viên chính', unitId: 'k-ktqt', roles: [{ role: 'RESEARCHER', scope: 'tenant' }, { role: 'SUPERVISOR', scope: 'tenant' }] },
      { key: 'researcher2', email: 'gv.chi@demo.aisrm.test', displayName: 'ThS. Lê Minh Chí', title: 'Giảng viên', unitId: 'k-qtkd', roles: [{ role: 'RESEARCHER', scope: 'tenant' }] },
      { key: 'researcher3', email: 'gv.dung@demo.aisrm.test', displayName: 'TS. Phạm Quốc Dũng', title: 'Giảng viên', unitId: 'bm-cs2-kt', roles: [{ role: 'RESEARCHER', scope: 'tenant' }] },
      { key: 'focal', email: 'dm.ktqt@demo.aisrm.test', displayName: 'ThS. Hoàng Thu Hà', title: 'Đầu mối KH Khoa KTQT', unitId: 'k-ktqt', roles: [{ role: 'RESEARCHER', scope: 'tenant' }, { role: 'UNIT_FOCAL', scope: 'k-ktqt' }] },
      { key: 'unitHead', email: 'tk.ktqt@demo.aisrm.test', displayName: 'PGS.TS. Vũ Đức Khang', title: 'Trưởng khoa KTQT', unitId: 'k-ktqt', roles: [{ role: 'RESEARCHER', scope: 'tenant' }, { role: 'UNIT_HEAD', scope: 'k-ktqt' }] },
      { key: 'focal2', email: 'dm.qtkd@demo.aisrm.test', displayName: 'ThS. Đỗ Mai Lan', title: 'Đầu mối KH Khoa QTKD', unitId: 'k-qtkd', roles: [{ role: 'RESEARCHER', scope: 'tenant' }, { role: 'UNIT_FOCAL', scope: 'k-qtkd' }] },
      { key: 'campusHead', email: 'gd.cs2@demo.aisrm.test', displayName: 'PGS.TS. Bùi Thanh Long', title: 'Giám đốc Cơ sở II', unitId: 'cs-hcm', roles: [{ role: 'UNIT_HEAD', scope: 'cs-hcm' }, { role: 'UNIT_FOCAL', scope: 'cs-hcm' }] },
      { key: 'officer', email: 'cv.linh@demo.aisrm.test', displayName: 'Ngô Thùy Linh', title: 'Chuyên viên Phòng QLKH', unitId: 'p-qlkh', roles: [{ role: 'SCIENCE_OFFICER', scope: 'tenant' }] },
      { key: 'officer2', email: 'cv.minh@demo.aisrm.test', displayName: 'Đặng Quang Minh', title: 'Chuyên viên Phòng QLKH', unitId: 'p-qlkh', roles: [{ role: 'SCIENCE_OFFICER', scope: 'tenant' }] },
      { key: 'head', email: 'tp.hung@demo.aisrm.test', displayName: 'TS. Lý Văn Hùng', title: 'Trưởng phòng QLKH', unitId: 'p-qlkh', roles: [{ role: 'SCIENCE_HEAD', scope: 'tenant' }] },
      { key: 'viceRector', email: 'pht.nam@demo.aisrm.test', displayName: 'PGS.TS. Trịnh Hoài Nam', title: 'Phó Hiệu trưởng', unitId: 'bgh', roles: [{ role: 'VICE_RECTOR', scope: 'tenant' }] },
      { key: 'rector', email: 'ht.quang@demo.aisrm.test', displayName: 'GS.TS. Mai Đình Quang', title: 'Hiệu trưởng', unitId: 'bgh', roles: [{ role: 'RECTOR', scope: 'tenant' }] },
      { key: 'admin', email: 'admin@demo.aisrm.test', displayName: 'Quản trị hệ thống', title: 'Trung tâm CNTT', unitId: 'root', roles: [{ role: 'SYS_ADMIN', scope: 'tenant' }, { role: 'AI_ADMIN', scope: 'tenant' }, { role: 'INTEGRATION_ADMIN', scope: 'tenant' }] },
    ],
  },
  {
    id: 'demo2',
    name: 'Trường Đại học Thử nghiệm 2 (dữ liệu giả lập)',
    units: [
      { id: 'root', code: 'DH2', name: 'Trường Đại học Thử nghiệm 2', type: 'UNIVERSITY', parentId: null },
      { id: 'p-kh', code: 'PKH', name: 'Phòng Khoa học', type: 'OFFICE', parentId: 'root' },
      { id: 'k-cntt', code: 'CNTT', name: 'Khoa Công nghệ thông tin', type: 'FACULTY', parentId: 'root' },
    ],
    users: [
      { key: 't2Researcher', email: 'gv.xuan@demo2.aisrm.test', displayName: 'TS. Kiều Xuân', title: 'Giảng viên', unitId: 'k-cntt', roles: [{ role: 'RESEARCHER', scope: 'tenant' }] },
      { key: 't2Officer', email: 'cv.yen@demo2.aisrm.test', displayName: 'Tạ Hải Yến', title: 'Chuyên viên', unitId: 'p-kh', roles: [{ role: 'SCIENCE_OFFICER', scope: 'tenant' }] },
    ],
  },
];

export const CALL_FORM = {
  version: 1,
  fields: [
    { key: 'field', label: 'Lĩnh vực nghiên cứu', type: 'select' as const, required: true, options: ['Kinh tế', 'Kinh doanh – Quản lý', 'Luật', 'Ngôn ngữ – Văn hóa', 'Khác'] },
    { key: 'urgency', label: 'Tính cấp thiết', type: 'textarea' as const, required: true, maxLength: 5000 },
    { key: 'objective', label: 'Mục tiêu nghiên cứu', type: 'textarea' as const, required: true, maxLength: 3000 },
    { key: 'methods', label: 'Phương pháp nghiên cứu', type: 'textarea' as const, required: true, maxLength: 5000 },
    { key: 'expectedOutputs', label: 'Sản phẩm dự kiến', type: 'textarea' as const, required: true, maxLength: 3000, help: 'Bài báo, báo cáo, sách, phần mềm… kèm số lượng và chỉ mục dự kiến' },
    { key: 'applicationValue', label: 'Khả năng ứng dụng', type: 'textarea' as const, required: false, maxLength: 3000 },
  ],
  checklist: [
    { key: 'thuyet_minh', label: 'Thuyết minh đề tài (theo mẫu)', required: true },
    { key: 'du_toan', label: 'Dự toán kinh phí', required: true },
    { key: 'ly_lich', label: 'Lý lịch khoa học chủ nhiệm', required: false },
  ],
};

export const STUDENT_CALL_FORM = {
  version: 1,
  fields: [
    { key: 'field', label: 'Lĩnh vực', type: 'select' as const, required: true, options: ['Kinh tế', 'Kinh doanh – Quản lý', 'Luật', 'Khác'] },
    { key: 'objective', label: 'Mục tiêu', type: 'textarea' as const, required: true, maxLength: 2000 },
    { key: 'supervisor', label: 'Giảng viên hướng dẫn', type: 'text' as const, required: true, maxLength: 200 },
  ],
  checklist: [{ key: 'de_cuong', label: 'Đề cương nghiên cứu', required: true }],
};
