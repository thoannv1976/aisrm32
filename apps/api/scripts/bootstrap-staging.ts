/**
 * Khởi tạo dữ liệu cho môi trường STAGING (project aisrm32) — dữ liệu giả lập để chạy thử.
 *
 *   gcloud auth application-default login     (tài khoản có quyền Owner/Editor trên aisrm32)
 *   pnpm --filter @aisrm/api bootstrap:staging -- --project aisrm32 --confirm
 *
 * - Không xóa dữ liệu: từ chối chạy nếu tenant đã tồn tại.
 * - Mỗi tài khoản có mật khẩu ngẫu nhiên mạnh, ghi vào tệp cục bộ `.staging-accounts.local.txt` (đã gitignore),
 *   KHÔNG in ra màn hình và KHÔNG commit.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !project || project.startsWith('demo-')) {
  console.error('Cần --project <id project thật>, vd: --project aisrm32');
  process.exit(1);
}
if (!args.includes('--confirm')) {
  console.error(`Thêm --confirm để xác nhận ghi dữ liệu giả lập vào project "${project}".`);
  process.exit(1);
}
for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete process.env[k];
process.env.APP_ENV = 'staging';
process.env.FIREBASE_PROJECT_ID = project;
process.env.GCP_PROJECT_ID = project;
process.env.GOOGLE_CLOUD_PROJECT = project;
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = project;

function strongPassword(): string {
  // 18 ký tự ngẫu nhiên + đủ loại ký tự cho chính sách mật khẩu
  return randomBytes(14).toString('base64url') + 'a9#Z';
}

async function main() {
  // Import sau khi đặt biến môi trường để Admin SDK trỏ đúng project thật.
  const { db } = await import('../src/infra');
  const { seedTenant, seedBusiness } = await import('./seed');
  const { TENANTS } = await import('./seed-data');

  for (const t of TENANTS) {
    const exists = await db().collection('tenants').doc(t.id).get();
    if (exists.exists) {
      console.error(`Tenant "${t.id}" đã tồn tại trên ${project} — dừng, không ghi đè dữ liệu.`);
      process.exit(2);
    }
  }

  const passwords = new Map<string, string>();
  const lines = [
    `# Tài khoản staging AI-SRM — project ${project} — tạo ${new Date().toISOString()}`,
    '# Dữ liệu giả lập. KHÔNG commit, KHÔNG chia sẻ công khai. Đổi/xóa tài khoản khi kết thúc thử nghiệm.',
    '',
  ];
  for (const t of TENANTS) {
    const users = await seedTenant(t, (email) => {
      const p = strongPassword();
      passwords.set(email, p);
      return p;
    });
    if (t.id === 'ftu') await seedBusiness(t.id, users);
    for (const u of t.users) lines.push(`[${t.id}] ${u.displayName} (${u.roles.map((r) => r.role).join(', ')})\n  ${u.email}\n  ${passwords.get(u.email)}\n`);
  }
  const out = resolve(__dirname, '../../../.staging-accounts.local.txt');
  writeFileSync(out, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  console.log(`Đã khởi tạo ${TENANTS.length} tenant trên ${project}. Danh sách tài khoản + mật khẩu: ${out}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  },
);
