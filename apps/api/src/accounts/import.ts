/**
 * Nhập tài khoản từ CSV (quản trị hệ thống). Chạy được ở cả hai bản: tạo tài khoản qua port Identity,
 * quyền truy cập (userTenants, people, roleBindings) qua DataStore — giống seed.
 *
 * Định dạng (dòng đầu là tiêu đề, UTF-8, phân cách dấu phẩy):
 *   email,displayName,unitId,title,roles
 *   gv.a@truong.edu.vn,TS. Nguyễn Văn A,k-ktqt,Giảng viên,RESEARCHER;UNIT_FOCAL@k-ktqt
 * roles: ngăn cách bằng ";"; "ROLE" = phạm vi toàn trường, "ROLE@unitId" = phạm vi đơn vị.
 */
import { ROLES, type Role } from '@aisrm/shared';
import { generatePassword } from '../infra/local-identity';
import { db, identity, localAuth, nowIso, tcol } from '../infra';

export interface ImportRow {
  line: number;
  email: string;
  displayName: string;
  unitId: string;
  title: string | null;
  roles: { role: Role; scopeId: string | null }[];
  action: 'CREATE' | 'UPDATE';
  errors: string[];
}

export interface ImportResultRow {
  line: number;
  email: string;
  uid: string;
  action: 'CREATE' | 'UPDATE';
  rolesAdded: number;
  /** Chỉ có với tài khoản mới tạo; chỉ trả về một lần. */
  temporaryPassword: string | null;
}

export const MAX_IMPORT_ROWS = 1000;

/** Bộ đọc CSV tối giản theo RFC 4180 (dấu ngoặc kép, xuống dòng trong ô, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const REQUIRED = ['email', 'displayName', 'unitId', 'roles'] as const;

export async function planImport(tenantId: string, csv: string): Promise<{ rows: ImportRow[]; errors: string[] }> {
  const table = parseCsv(csv);
  if (table.length < 2) return { rows: [], errors: ['Tệp CSV cần dòng tiêu đề và ít nhất một dòng dữ liệu.'] };
  const header = table[0].map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], errors: [`Thiếu cột: ${missing.join(', ')}. Cột cần có: email,displayName,unitId,title,roles`] };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: [`Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần nhập.`] };

  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? '').trim();
  const units = new Set((await tcol(tenantId, 'units').get()).docs.map((d) => d.id));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const errors: string[] = [];
    const email = col(r, 'email').toLowerCase();
    const displayName = col(r, 'displayName');
    const unitId = col(r, 'unitId');
    const title = col(r, 'title') || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email không hợp lệ.');
    if (seen.has(email)) errors.push('Email bị lặp trong tệp.');
    seen.add(email);
    if (displayName.length < 2 || displayName.length > 120) errors.push('Họ tên cần 2–120 ký tự.');
    if (!units.has(unitId)) errors.push(`Đơn vị "${unitId}" không tồn tại.`);
    const roles: ImportRow['roles'] = [];
    for (const raw of col(r, 'roles').split(';').map((x) => x.trim()).filter(Boolean)) {
      const [role, scope] = raw.split('@').map((x) => x.trim());
      if (!(ROLES as readonly string[]).includes(role)) {
        errors.push(`Vai trò không hợp lệ: ${raw}.`);
        continue;
      }
      if (scope && !units.has(scope)) {
        errors.push(`Phạm vi đơn vị "${scope}" của vai trò ${role} không tồn tại.`);
        continue;
      }
      roles.push({ role: role as Role, scopeId: scope || null });
    }
    if (roles.length === 0 && !errors.some((e) => e.startsWith('Vai trò'))) errors.push('Cần ít nhất một vai trò.');
    const uid = errors.length ? null : await identity().findUidByEmail(email);
    rows.push({ line: i + 1, email, displayName, unitId, title, roles, action: uid ? 'UPDATE' : 'CREATE', errors });
  }
  return { rows, errors: [] };
}

export async function applyImport(tenantId: string, rows: ImportRow[]): Promise<ImportResultRow[]> {
  const out: ImportResultRow[] = [];
  const local = localAuth();
  for (const row of rows) {
    let uid = await identity().findUidByEmail(row.email);
    let temporaryPassword: string | null = null;
    const action: ImportResultRow['action'] = uid ? 'UPDATE' : 'CREATE';
    if (!uid) {
      if (local) {
        uid = await local.upsertUser({ email: row.email, displayName: row.displayName });
        temporaryPassword = await local.adminResetPassword(uid); // buộc đổi ở lần đăng nhập đầu
      } else {
        temporaryPassword = generatePassword();
        uid = await identity().upsertUser({ email: row.email, password: temporaryPassword, displayName: row.displayName });
      }
    }
    const store = db();
    const [membership, existing] = await Promise.all([store.collection('userTenants').doc(uid).get(), tcol(tenantId, 'roleBindings').where('uid', '==', uid).get()]);
    const have = new Set(existing.docs.map((d) => `${d.get('role')}|${d.get('scopeId') ?? ''}`));
    const tenantIds = new Set<string>(membership.exists ? (membership.get('tenantIds') ?? []) : []);
    tenantIds.add(tenantId);
    const now = nowIso();
    const b = store.batch();
    b.set(store.collection('userTenants').doc(uid), { tenantIds: [...tenantIds] }, { merge: true });
    b.set(tcol(tenantId, 'people').doc(uid), { displayName: row.displayName, email: row.email, title: row.title, unitId: row.unitId, status: 'ACTIVE', updatedAt: now }, { merge: true });
    let rolesAdded = 0;
    for (const r of row.roles) {
      if (have.has(`${r.role}|${r.scopeId ?? ''}`)) continue;
      rolesAdded++;
      b.set(tcol(tenantId, 'roleBindings').doc(), {
        uid,
        role: r.role,
        scopeType: r.scopeId ? 'unit' : 'tenant',
        scopeId: r.scopeId,
        validFrom: null,
        validUntil: null,
        delegatedBy: null,
        createdAt: now,
      });
    }
    await b.commit();
    out.push({ line: row.line, email: row.email, uid, action, rolesAdded, temporaryPassword });
  }
  return out;
}
