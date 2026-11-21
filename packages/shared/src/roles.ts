export const ROLES = [
  'STUDENT',
  'RESEARCHER',
  'SUPERVISOR',
  'UNIT_FOCAL',
  'UNIT_HEAD',
  'SCIENCE_OFFICER',
  'SCIENCE_HEAD',
  'VICE_RECTOR',
  'RECTOR',
  'BOARD',
  'REVIEWER',
  'SYS_ADMIN',
  'AI_ADMIN',
  'INTEGRATION_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Sinh viên / học viên / NCS',
  RESEARCHER: 'Giảng viên / nhà khoa học',
  SUPERVISOR: 'Người hướng dẫn / cố vấn',
  UNIT_FOCAL: 'Đầu mối khoa học đơn vị',
  UNIT_HEAD: 'Lãnh đạo khoa / viện / cơ sở',
  SCIENCE_OFFICER: 'Chuyên viên quản lý khoa học',
  SCIENCE_HEAD: 'Trưởng phòng quản lý khoa học',
  VICE_RECTOR: 'Phó Hiệu trưởng phụ trách',
  RECTOR: 'Hiệu trưởng',
  BOARD: 'Hội đồng trường / giám sát',
  REVIEWER: 'Phản biện / thành viên hội đồng',
  SYS_ADMIN: 'Quản trị hệ thống',
  AI_ADMIN: 'Quản trị AI',
  INTEGRATION_ADMIN: 'Quản trị tích hợp',
};

/** Nhóm vai trò dùng nhiều lần trong quy tắc nghiệp vụ. */
export const SCIENCE_OFFICE: Role[] = ['SCIENCE_OFFICER', 'SCIENCE_HEAD'];
export const LEADERSHIP: Role[] = ['VICE_RECTOR', 'RECTOR'];
export const UNIT_REVIEWERS: Role[] = ['UNIT_FOCAL', 'UNIT_HEAD'];
/** Vai trò được xem dữ liệu nghiên cứu toàn trường (trừ hồ sơ hạn chế). */
export const TENANT_READERS: Role[] = ['SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR'];
