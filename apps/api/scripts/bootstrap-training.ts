/**
 * Khởi tạo bản Online dùng cho KHÓA TẬP HUẤN: "Trường mẫu" (đúng tài khoản trong tài liệu, dùng chung cả lớp) và
 * mỗi trường tham dự một không gian riêng, có đầy đủ dữ liệu mẫu để làm bài tập và mang về trình diễn.
 *
 *   gcloud auth application-default login
 *   npx tsx scripts/bootstrap-training.ts --project aisrm24 --schools <truong.json> --out <thư mục ngoài repo> --confirm
 *
 * truong.json: [{ "id": "ump", "name": "Đại học Y Dược TP. Hồ Chí Minh", "code": "UMP", "units": { "<id đơn vị mẫu>": "<tên mới>" }, "titles": { "<key tài khoản mẫu>": "<chức danh>" } }]
 *  - Email tài khoản của trường: <tên>@<id>.aisrm.test (chỉ để đăng nhập, không nhận thư).
 *  - Mật khẩu: Trường mẫu dùng MỘT mật khẩu ngẫu nhiên chung (cho cả lớp); trường tham dự mỗi tài khoản một mật khẩu.
 *  - Mật khẩu ghi vào <out>/tai-khoan-tap-huan.local.json — không in ra màn hình, không commit.
 * Chạy lại được: trường đã có thì bỏ qua (không xóa / ghi đè dữ liệu).
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string) =>
  args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined;
const project = opt("project");
const schoolsFile = opt("schools");
const outDir = opt("out");
const emulator = args.includes("--emulator"); // chạy thử trên Firebase Emulator
if (
  !project ||
  (project.startsWith("demo-") && !emulator) ||
  !schoolsFile ||
  !outDir ||
  !args.includes("--confirm")
) {
  console.error(
    "Cần: --project <id project thật> --schools <truong.json> --out <thư mục> --confirm",
  );
  process.exit(1);
}
if (emulator)
  Object.assign(process.env, {
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  });
else
  for (const k of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
  ])
    delete process.env[k];
for (const k of ["DEPLOY_TARGET", "DATABASE_URL"]) delete process.env[k];
Object.assign(process.env, {
  APP_ENV: "staging",
  FIREBASE_PROJECT_ID: project,
  GCP_PROJECT_ID: project,
  GOOGLE_CLOUD_PROJECT: project,
  GOOGLE_CLOUD_QUOTA_PROJECT: project,
});
process.env.STORAGE_BUCKET ??= `${project}-documents`;

const strongPassword = () => randomBytes(12).toString("base64url") + "a9#Z";

interface School {
  id: string;
  name: string;
  code: string;
  units?: Record<string, string>;
  titles?: Record<string, string>; // chức danh mẫu theo key tài khoản (vd: focal, unitHead)
}

async function main() {
  const { db } = await import("../src/infra");
  const seed = await import("./seed");
  const { seedExtended } = await import("./seed-extended");
  const { TENANTS } = await import("./seed-data");
  const template = TENANTS.find((t) => t.id === "ftu")!;
  const schools: School[] = JSON.parse(
    readFileSync(resolve(schoolsFile!), "utf8"),
  );
  for (const s of schools)
    if (!/^[a-z0-9-]{2,30}$/.test(s.id) || s.id === "ftu")
      throw new Error(`Mã trường không hợp lệ: ${s.id}`);

  mkdirSync(resolve(outDir!), { recursive: true });
  const outFile = join(resolve(outDir!), "tai-khoan-tap-huan.local.json");
  const saved: Record<
    string,
    {
      name: string;
      accounts: {
        email: string;
        displayName: string;
        title: string;
        roles: string[];
        password: string;
      }[];
    }
  > = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};

  // Trường mẫu = tenant "ftu" của dữ liệu mẫu, đúng tài khoản trong hướng dẫn / bài tập; cả các trường tham dự (bản sao, đổi tên).
  const tenants = [
    { tenant: template, shared: true },
    ...schools.map((s) => ({
      shared: false,
      tenant: {
        ...template,
        id: s.id,
        name: `${s.name} (dữ liệu mẫu tập huấn)`,
        units: template.units.map((u) =>
          u.parentId === null
            ? { ...u, code: s.code, name: s.name }
            : { ...u, name: s.units?.[u.id] ?? u.name },
        ),
        users: template.users.map((u) => ({
          ...u,
          title: s.titles?.[u.key] ?? u.title,
          email: u.email.replace("@demo.aisrm.test", `@${s.id}.aisrm.test`),
        })),
      },
    })),
  ];

  for (const { tenant, shared } of tenants) {
    if (!TENANTS.some((t) => t.id === tenant.id)) TENANTS.push(tenant); // các hàm seed tra cứu cấu trúc trường trong TENANTS
    const exists = (await db().collection("tenants").doc(tenant.id).get())
      .exists;
    if (exists) {
      console.log(
        `[${tenant.id}] đã có — bỏ qua khởi tạo, chỉ bổ sung dữ liệu mẫu còn thiếu.`,
      );
    } else {
      const common = strongPassword();
      const pw = new Map<string, string>();
      const users = await seed.seedTenant(tenant, (email) => {
        const p = shared ? common : strongPassword();
        pw.set(email, p);
        return p;
      });
      await seed.seedBusiness(tenant.id, users);
      saved[tenant.id] = {
        name: tenant.name,
        accounts: tenant.users.map((u) => ({
          email: u.email,
          displayName: u.displayName,
          title: u.title,
          roles: u.roles.map((r) => r.role),
          password: pw.get(u.email)!,
        })),
      };
      writeFileSync(outFile, JSON.stringify(saved, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      console.log(
        `[${tenant.id}] đã tạo trường, ${tenant.users.length} tài khoản, hồ sơ nghiệp vụ mẫu.`,
      );
    }
    console.log(
      `[${tenant.id}] AI mặc định (giả lập): ${(await seed.seedAiDefaults(tenant.id, { onlyIfMissing: true })) ? "đã tạo" : "đã có"}`,
    );
    console.log(
      `[${tenant.id}] NCKH sinh viên mẫu: ${(await seed.seedStudentResearch(tenant.id)) ? "đã tạo" : "đã có"}`,
    );
    console.log(
      `[${tenant.id}] hồ sơ chuyên môn mẫu: thêm ${await seed.seedProfiles(tenant.id)}`,
    );
    console.log(
      `[${tenant.id}] quy chế KHCN mẫu: ${(await seed.seedRegulations(tenant.id)) ? "đã nạp" : "đã có"}`,
    );
    console.log(
      `[${tenant.id}] HEMIS / kinh phí / danh mục KH&CN mẫu: ${(await seedExtended(tenant.id)) ? "đã tạo" : "đã có"}`,
    );
  }
  console.log(`Xong. Tài khoản + mật khẩu: ${outFile}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e?.stack ?? e);
    process.exit(1);
  },
);
