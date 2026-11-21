/** Chuẩn hóa DOI: bỏ tiền tố URL/"doi:", chữ thường, cắt khoảng trắng. Trả null nếu không hợp lệ. */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
  if (!/^10\.\d{4,9}\/\S+$/.test(s)) return null;
  return s;
}

/** Chuẩn hóa tiêu đề để so trùng gần đúng (bỏ dấu tiếng Việt, ký tự đặc biệt). */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
