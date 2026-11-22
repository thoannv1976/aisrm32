/**
 * Công cụ dòng lệnh cho bản cài AI-SRM Local (chạy trong container api: `node dist-cli/scripts/local-cli.js <lệnh>`).
 *
 *   init   --tenant-id <ma> --tenant-name "<Tên trường>" --admin-email <email> --admin-name "<Họ tên>" [--units units.csv]
 *          Khởi tạo trường mới: đơn vị (từ CSV hoặc chỉ đơn vị gốc + Phòng QLKH), tài khoản quản trị (mật khẩu tạm in một lần,
 *          buộc đổi ở lần đăng nhập đầu), cấu hình AI mặc định. Từ chối nếu mã trường đã tồn tại.
 *   demo   Nạp dữ liệu mẫu (giả lập) để tập huấn — chỉ khi CSDL CHƯA có trường nào.
 *   status Liệt kê trường, số tài khoản.
 *
 * units.csv (UTF-8, dòng đầu là tiêu đề): id,code,name,type,parentId — type: UNIVERSITY|CAMPUS|FACULTY|INSTITUTE|OFFICE|DEPARTMENT.
 */
import { readFileSync } from 'node:fs';
import { applyImport, parseCsv } from '../src/accounts/import';
import { db, identity, nowIso } from '../src/infra';
import { seedAiDefaults, seedBusiness, seedTenant } from './seed';
import { DEMO_PASSWORD, TENANTS } from './seed-data';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const TYPES = ['UNIVERSITY', 'CAMPUS', 'FACULTY', 'INSTITUTE', 'OFFICE', 'DEPARTMENT'];

async function tenantCount() {
  return (await db().collection('tenants').get()).docs.length;
}

async function init() {
  const tenantId = opt('tenant-id');
  const tenantName = opt('tenant-name');
  const adminEmail = opt('admin-email')?.toLowerCase();
  const adminName = opt('admin-name') ?? 'Quản trị hệ thống';
  if (!tenantId || !/^[a-z0-9-]{2,30}$/.test(tenantId)) throw new Error('--tenant-id: 2–30 ký tự a-z, 0-9, "-" (vd: ftu).');
  if (!tenantName) throw new Error('Thiếu --tenant-name.');
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('--admin-email không hợp lệ.');
  const tdoc = db().collection('tenants').doc(tenantId);
  if ((await tdoc.get()).exists) throw new Error(`Trường "${tenantId}" đã tồn tại — không khởi tạo lại.`);

  let units: { id: string; code: string; name: string; type: string; parentId: string | null }[];
  const file = opt('units');
  if (file) {
    const rows = parseCsv(readFileSync(file, 'utf8'));
    const h = rows[0].map((x) => x.trim());
    const col = (r: string[], n: string) => (r[h.indexOf(n)] ?? '').trim();
    units = rows.slice(1).map((r) => ({ id: col(r, 'id'), code: col(r, 'code'), name: col(r, 'name'), type: col(r, 'type'), parentId: col(r, 'parentId') || null }));
    const ids = new Set(units.map((u) => u.id));
    for (const u of units) {
      if (!/^[a-z0-9-]{1,40}$/.test(u.id)) throw new Error(`Mã đơn vị không hợp lệ: "${u.id}" (a-z, 0-9, "-").`);
      if (!TYPES.includes(u.type)) throw new Error(`Loại đơn vị không hợp lệ: ${u.type} (${u.id}).`);
      if (u.parentId && !ids.has(u.parentId)) throw new Error(`Đơn vị cha "${u.parentId}" của ${u.id} không có trong tệp.`);
    }
    if (units.filter((u) => !u.parentId).length !== 1) throw new Error('Tệp đơn vị cần đúng một đơn vị gốc (parentId trống).');
  } else {
    units = [
      { id: 'root', code: tenantId.toUpperCase(), name: tenantName, type: 'UNIVERSITY', parentId: null },
      { id: 'p-qlkh', code: 'QLKH', name: 'Phòng Quản lý khoa học', type: 'OFFICE', parentId: 'root' },
    ];
  }
  const byId = new Map(units.map((u) => [u.id, u]));
  const ancestors = (id: string) => {
    const out: string[] = [];
    for (let cur = byId.get(id)?.parentId ?? null; cur; cur = byId.get(cur)?.parentId ?? null) out.push(cur);
    return out;
  };
  await tdoc.set({ name: tenantName, createdAt: nowIso() });
  const b = db().batch();
  for (const u of units) b.set(tdoc.collection('units').doc(u.id), { code: u.code, name: u.name, type: u.type, parentId: u.parentId, ancestorIds: ancestors(u.id) });
  await b.commit();
  const root = units.find((u) => !u.parentId)!;
  const office = units.find((u) => u.type === 'OFFICE') ?? root;
  const [res] = await applyImport(tenantId, [
    { line: 1, email: adminEmail, displayName: adminName, unitId: office.id, title: 'Quản trị hệ thống', roles: ['SYS_ADMIN', 'AI_ADMIN', 'INTEGRATION_ADMIN', 'SCIENCE_HEAD'].map((role) => ({ role: role as 'SYS_ADMIN', scopeId: null })), action: 'CREATE', errors: [] },
  ]);
  await seedAiDefaults(tenantId);
  console.log(`\nĐã khởi tạo trường "${tenantName}" (${tenantId}) với ${units.length} đơn vị.`);
  console.log(`Tài khoản quản trị: ${adminEmail}`);
  if (res.temporaryPassword) console.log(`Mật khẩu tạm (chỉ hiện một lần, đổi ngay ở lần đăng nhập đầu): ${res.temporaryPassword}`);
  console.log('Tiếp theo: đăng nhập → Quản trị → Tài khoản → Nhập tài khoản từ CSV.');
}

async function demo() {
  if ((await tenantCount()) > 0) throw new Error('CSDL đã có dữ liệu — chỉ nạp dữ liệu mẫu vào bản cài mới (trống).');
  for (const t of TENANTS) {
    const users = await seedTenant(t);
    if (t.id === 'ftu') await seedBusiness(t.id, users);
  }
  console.log(`\nĐã nạp dữ liệu mẫu (giả lập). Mật khẩu chung của tài khoản mẫu: ${DEMO_PASSWORD}`);
  for (const t of TENANTS) for (const u of t.users) console.log(`  [${t.id}] ${u.email.padEnd(28)} ${u.displayName}`);
  console.log('CHỈ dùng cho tập huấn / thử nghiệm; không nhập dữ liệu thật vào bản cài này.');
}

async function status() {
  const tenants = await db().collection('tenants').get();
  if (tenants.docs.length === 0) console.log('Chưa có trường nào. Chạy "init" hoặc "demo".');
  for (const t of tenants.docs) {
    const people = await db().collection('tenants').doc(t.id).collection('people').get();
    console.log(`${t.id}\t${t.get('name')}\t${people.docs.length} tài khoản`);
  }
  console.log(`Đăng nhập: ${identity().kind}`);
}

const run = cmd === 'init' ? init : cmd === 'demo' ? demo : cmd === 'status' ? status : null;
if (!run) {
  console.log('Dùng: local-cli.js init|demo|status  (xem chú thích đầu tệp)');
  process.exit(cmd ? 1 : 0);
}
run!().then(
  () => process.exit(0),
  (e) => {
    console.error(`Lỗi: ${e?.message ?? e}`);
    process.exit(1);
  },
);
