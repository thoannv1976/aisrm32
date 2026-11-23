/**
 * Danh sách tài khoản (email + mật khẩu) phát cho học viên dùng bản Online tập huấn — một tệp Word cho mọi trường.
 * Có mật khẩu: lưu NGOÀI repo, gửi qua kênh an toàn.
 *   node tests/guide/build-account-list.cjs <tai-khoan-tap-huan.local.json> <thư mục ra> <địa chỉ web>
 */
const fs = require("node:fs");
const { createKit } = require("./docx-kit.cjs");

const [accFile, outDir, url] = process.argv.slice(2);
if (!accFile || !outDir || !url) {
  console.error(
    "Dùng: node build-account-list.cjs <tai-khoan.json> <thư mục ra> <địa chỉ web>",
  );
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(accFile, "utf8"));
const ROLE = {
  STUDENT: "Sinh viên",
  RESEARCHER: "Nhà khoa học",
  SUPERVISOR: "GV hướng dẫn",
  UNIT_FOCAL: "Đầu mối KH đơn vị",
  UNIT_HEAD: "Trưởng đơn vị",
  SCIENCE_OFFICER: "Chuyên viên QLKH",
  SCIENCE_HEAD: "Trưởng phòng QLKH",
  VICE_RECTOR: "Phó Hiệu trưởng",
  RECTOR: "Hiệu trưởng",
  SYS_ADMIN: "Quản trị hệ thống",
  AI_ADMIN: "Quản trị AI",
  INTEGRATION_ADMIN: "Quản trị tích hợp",
};
const today = new Date().toLocaleDateString("vi-VN");

(async () => {
  const k = createKit({ manifests: [] });
  const { p, h1, bullet, table, centered, note } = k;
  const body = [
    centered(
      "DANH SÁCH TÀI KHOẢN HỌC VIÊN",
      { bold: true, size: 36, color: "1F3A5F" },
      { spacing: { before: 200 } },
    ),
    centered(
      "Hệ thống AI-SRM — bản Online dùng trong khóa tập huấn",
      { size: 24, color: "555555" },
      { spacing: { after: 300 } },
    ),
    table(
      ["Mục", "Nội dung"],
      [
        ["Địa chỉ đăng nhập", url],
        ["Ngày lập", today],
        [
          "Cách đăng nhập",
          "Mở địa chỉ trên bằng Chrome / Edge / Firefox → nhập Email đăng nhập và Mật khẩu ở bảng dưới (chọn đúng vai trò cần thực hành).",
        ],
      ],
      [3, 7],
    ),
    p(""),
    note(
      "Tài liệu mật — chỉ phát cho học viên khóa tập huấn, không đăng công khai. Hệ thống chỉ chứa dữ liệu mẫu: không nhập dữ liệu thật.",
    ),
  ];
  let n = 0;
  for (const [id, t] of Object.entries(data)) {
    n++;
    const shared = id === "ftu";
    const label = shared
      ? "Trường mẫu (dùng chung cả lớp)"
      : t.name.replace(" (dữ liệu mẫu tập huấn)", "");
    body.push(
      h1(`${n}. ${label} — mã không gian: ${id}`),
      shared
        ? bullet(
            "Dùng để làm theo tài liệu Hướng dẫn sử dụng và Bài tập thực hành (tài khoản trùng với tài liệu). Tất cả tài khoản dùng chung một mật khẩu — KHÔNG đổi mật khẩu trong thời gian tập huấn.",
          )
        : bullet(
            `Không gian riêng của trường, mang về dùng sau tập huấn. Khi làm bài tập, thay "demo" trong email ở tài liệu bằng "${id}". Mỗi tài khoản một mật khẩu riêng; sau tập huấn nên đổi mật khẩu (nút "Đổi mật khẩu" trên thanh trên cùng).`,
          ),
      table(
        ["STT", "Vai trò", "Họ tên (mẫu)", "Email đăng nhập", "Mật khẩu"],
        t.accounts.map((a, i) => [
          String(i + 1),
          a.roles.map((r) => ROLE[r] ?? r).join(", "),
          a.displayName,
          a.email,
          a.password,
        ]),
        [1, 3, 3, 5, 4],
      ),
      p(""),
    );
  }
  body.push(
    h1(`${n + 1}. Lưu ý`),
    bullet(
      "Email ...aisrm.test chỉ dùng để đăng nhập, không nhận được thư. Quên mật khẩu: liên hệ Ban tổ chức để cấp lại.",
    ),
    bullet(
      "Gõ đúng mật khẩu, phân biệt chữ hoa / chữ thường; nên sao chép – dán thay vì gõ tay.",
    ),
    bullet(
      "Mỗi người đăng xuất (nút Đăng xuất) khi dùng xong trên máy dùng chung.",
    ),
  );
  await k.save(body, {
    fileName: "DANH_SACH_TAI_KHOAN_HOC_VIEN.docx",
    title: "AI-SRM — Danh sách tài khoản học viên",
    header: "AI-SRM · Danh sách tài khoản học viên · TÀI LIỆU MẬT",
    outDir,
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
