/**
 * Phiếu bàn giao bản Online tập huấn — mỗi trường một tệp Word (có mật khẩu: lưu NGOÀI repo, gửi qua kênh an toàn).
 *   node tests/guide/build-handover.cjs <tai-khoan-tap-huan.local.json> <thư mục ra> <địa chỉ web>
 */
const fs = require("node:fs");
const { createKit } = require("./docx-kit.cjs");

const [accFile, outDir, url] = process.argv.slice(2);
if (!accFile || !outDir || !url) {
  console.error(
    "Dùng: node build-handover.cjs <tai-khoan.json> <thư mục ra> <địa chỉ web>",
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
  for (const [id, t] of Object.entries(data)) {
    const k = createKit({ manifests: [] });
    const { p, h1, bullet, steps, table, centered, note } = k;
    const shared = id === "ftu";
    const label = shared
      ? "Trường mẫu (dùng chung cả lớp)"
      : t.name.replace(" (dữ liệu mẫu tập huấn)", "");
    const body = [
      centered(
        "PHIẾU BÀN GIAO HỆ THỐNG AI-SRM",
        { bold: true, size: 36, color: "1F3A5F" },
        { spacing: { before: 200 } },
      ),
      centered(
        "Bản Online dùng trong khóa tập huấn",
        { size: 24, color: "555555" },
        { spacing: { after: 300 } },
      ),
      table(
        ["Mục", "Nội dung"],
        [
          ["Đơn vị nhận", label],
          ["Địa chỉ hệ thống", url],
          ["Mã không gian", id],
          ["Ngày bàn giao", today],
          [
            "Chế độ AI",
            "Giả lập (miễn phí). Chạy AI thật: quản trị nhập khóa API tại AI Center, đặt hạn mức trước khi bật.",
          ],
          [
            "Dữ liệu",
            "Dữ liệu mẫu giả lập — dùng để tập huấn, làm bài tập, trình diễn cho lãnh đạo.",
          ],
        ],
        [3, 7],
      ),
      p(""),
      h1("1. Cách dùng"),
      ...steps([
        `Mở ${url} bằng Chrome / Edge / Firefox bản mới.`,
        "Đăng nhập bằng một tài khoản ở mục 2, theo vai trò cần thực hành.",
        shared
          ? 'Tài khoản trùng với tài liệu "Hướng dẫn sử dụng" và "Bài tập thực hành" — dùng ngay theo tài liệu.'
          : 'Tài liệu "Hướng dẫn sử dụng" và "Bài tập thực hành" ghi tài khoản dạng ...@demo.aisrm.test: thay "demo" bằng "' +
            id +
            '" (ví dụ gv.binh@' +
            id +
            ".aisrm.test).",
        "Trường có toàn quyền trong không gian của mình: tạo thêm tài khoản (Quản trị → Tài khoản → Nhập từ CSV), sửa cơ cấu đơn vị, nhập dữ liệu thử.",
      ]),
      h1("2. Tài khoản"),
      shared
        ? note(
            "Các tài khoản Trường mẫu dùng CHUNG một mật khẩu cho cả lớp. Không đổi mật khẩu các tài khoản này trong thời gian tập huấn.",
          )
        : note(
            'Mỗi tài khoản một mật khẩu riêng. Sau tập huấn, người dùng nên đổi mật khẩu (nút "Đổi mật khẩu" trên thanh trên cùng).',
          ),
      table(
        ["Vai trò", "Họ tên (mẫu)", "Email đăng nhập", "Mật khẩu"],
        t.accounts.map((a) => [
          a.roles.map((r) => ROLE[r] ?? r).join(", "),
          `${a.displayName}\n${a.title}`,
          a.email,
          a.password,
        ]),
        [3, 3, 4, 3],
      ),
      p(""),
      h1("3. Quy định sử dụng"),
      bullet(
        "Hệ thống tập huấn chỉ chứa dữ liệu mẫu. Không nhập dữ liệu cá nhân thật, số liệu tài chính thật, tài liệu mật.",
      ),
      bullet(
        "Không chia sẻ phiếu này công khai (mạng xã hội, nhóm chat mở). Mật khẩu chỉ gửi qua kênh an toàn.",
      ),
      bullet(
        "Tài khoản email ...aisrm.test chỉ dùng để đăng nhập, không nhận được thư; quên mật khẩu: liên hệ Ban tổ chức để cấp lại.",
      ),
      bullet(
        "Hệ thống được duy trì sau khóa học để trường tiếp tục đào tạo nội bộ và báo cáo lãnh đạo; thời hạn duy trì do Ban tổ chức thông báo.",
      ),
      bullet(
        "Triển khai chính thức trên máy chủ của trường (bản Local, AI nội bộ) thực hiện sau tập huấn, theo bộ cài và hướng dẫn cài đặt riêng.",
      ),
      h1("4. Hỗ trợ"),
      p(
        "Liên hệ Ban tổ chức khóa tập huấn khi cần cấp lại mật khẩu, thêm tài khoản quản trị hoặc báo lỗi (ghi rõ thời điểm, tài khoản, màn hình).",
      ),
      p(""),
      table(
        ["Bên giao", "Bên nhận"],
        [["\n\n\n(ký, ghi rõ họ tên)", "\n\n\n(ký, ghi rõ họ tên)"]],
        [1, 1],
      ),
    ];
    await k.save(body, {
      fileName: `PHIEU_BAN_GIAO_${id.toUpperCase()}.docx`,
      title: `AI-SRM — Phiếu bàn giao — ${label}`,
      header: `AI-SRM · Phiếu bàn giao · ${label}`,
      outDir,
    });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
