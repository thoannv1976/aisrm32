/**
 * Nâng cấp dữ liệu staging lên phiên bản có AI Center + UNI-DATA360 giả lập. Idempotent, không xóa dữ liệu.
 *   npx tsx scripts/migrate-staging.ts --project aisrm32 --confirm
 */
const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !project || project.startsWith('demo-') || !args.includes('--confirm')) {
  console.error('Cần --project <id project thật> --confirm');
  process.exit(1);
}
for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete process.env[k];
Object.assign(process.env, { APP_ENV: 'staging', FIREBASE_PROJECT_ID: project, GCP_PROJECT_ID: project, GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_QUOTA_PROJECT: project });

async function main() {
  const { db } = await import('../src/infra');
  const { seedAiDefaults, seedStudentResearch, seedProfiles, seedRegulations } = await import('./seed');
  const { TENANTS } = await import('./seed-data');
  for (const t of TENANTS) {
    const tdoc = db().collection('tenants').doc(t.id);
    if (!(await tdoc.get()).exists) continue;
    if (t.id === 'ftu') {
      console.log(`[${t.id}] cấu hình AI mặc định: ${(await seedAiDefaults(t.id, { onlyIfMissing: true })) ? 'đã tạo' : 'đã có, giữ nguyên'}`);
      console.log(`[${t.id}] dữ liệu mẫu NCKH sinh viên: ${(await seedStudentResearch(t.id)) ? 'đã tạo' : 'đã có, giữ nguyên'}`);
      console.log(`[${t.id}] hồ sơ chuyên môn mẫu: thêm ${await seedProfiles(t.id)}`);
      console.log(`[${t.id}] quy chế KHCN mẫu: ${(await seedRegulations(t.id)) ? 'đã nạp' : 'đã có, giữ nguyên'}`);
    }
    // Bổ sung vai trò còn thiếu theo seed-data (vd: AI_ADMIN, INTEGRATION_ADMIN cho quản trị)
    for (const u of t.users) {
      const person = await tdoc.collection('people').where('email', '==', u.email).limit(1).get();
      if (person.empty) continue;
      const uid = person.docs[0].id;
      const existing = await tdoc.collection('roleBindings').where('uid', '==', uid).get();
      for (const r of u.roles) {
        const scopeType = r.scope === 'tenant' ? 'tenant' : 'unit';
        const scopeId = r.scope === 'tenant' ? null : r.scope;
        if (existing.docs.some((d) => d.get('role') === r.role && (d.get('scopeId') ?? null) === scopeId)) continue;
        await tdoc.collection('roleBindings').add({ uid, role: r.role, scopeType, scopeId, validFrom: null, validUntil: null, delegatedBy: null, createdAt: new Date().toISOString() });
        console.log(`[${t.id}] + ${r.role} cho ${u.email}`);
      }
    }
  }
}
main().then(() => process.exit(0), (e) => (console.error(e?.message ?? e), process.exit(1)));
