import { Card, PageHeader } from '../components/ui';

function Pending({ items }: { items: string[] }) {
  return (
    <Card>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-300">
        ⏳ Chưa triển khai — dự kiến Giai đoạn 3
      </div>
      <p className="mb-3 text-sm text-slate-600">Phân hệ này chưa hoạt động. Không có nút giả lập kết quả. Phạm vi dự kiến:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Card>
  );
}

export function AiCenterPage() {
  return (
    <>
      <PageHeader title="AI Center" subtitle="Trợ lý AI có trích nguồn, quản trị nhà cung cấp, prompt, hạn mức và chi phí" />
      <Pending
        items={[
          'Hỏi đáp quy chế, quy trình, biểu mẫu có dẫn nguồn và phiên bản văn bản (từ chối khi thiếu căn cứ)',
          'Trích xuất thông tin từ hồ sơ, bài báo, minh chứng kèm vị trí nguồn',
          'Kiểm tra hồ sơ: phát hiện thiếu dữ liệu, mâu thuẫn, sai phiên bản biểu mẫu',
          'Dự thảo báo cáo từ số liệu đã chốt',
          'Quản trị: nhà cung cấp/model, định tuyến theo chức năng, prompt có phiên bản, quota, usage, tắt khẩn cấp',
          'AI chỉ tạo dự thảo — người có thẩm quyền xác nhận; nghiệp vụ vẫn chạy khi AI gián đoạn',
        ]}
      />
    </>
  );
}

export function IntegrationCenterPage() {
  return (
    <>
      <PageHeader title="Integration Center" subtitle="Kết nối UNI-DATA360 và hệ thống hiện có" />
      <Pending
        items={[
          'Nhận đơn vị, cán bộ, người học từ UNI-DATA360 (mock trước, kết nối thật khi có hợp đồng API và credential)',
          'Xuất đề tài, công bố đã duyệt, chỉ số nghiên cứu sang UNI-DATA360',
          'Outbox/inbox, idempotency, retry, replay, hàng lỗi và đối soát',
          'Dashboard: lần đồng bộ cuối, độ trễ, bản ghi thành công/lỗi/xung đột',
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">
        Hiện AI-SRM đã ghi sự kiện nghiệp vụ vào outbox (trạng thái PENDING) cho mỗi lần chuyển trạng thái, sẵn sàng cho bộ đồng bộ ở Giai đoạn 3. Chưa có dữ liệu nào được gửi ra ngoài.
      </p>
    </>
  );
}
