/** Lưu tệp trên ổ đĩa (bản Local): ghi / đọc / xóa, siêu dữ liệu, chặn thoát khỏi thư mục gốc. */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diskFileStore, FileNotFoundError } from '../src/infra/disk-filestore';

const root = mkdtempSync(join(tmpdir(), 'aisrm-files-'));
const fs = diskFileStore(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('FileStore ổ đĩa', () => {
  it('ghi, đọc, ghi đè, xóa; lưu siêu dữ liệu kèm; không để lại tệp tạm', async () => {
    const p = 'tenants/ftu/proposal/dx1/abc123';
    await fs.save(p, Buffer.from('%PDF-1 lần 1'), { contentType: 'application/pdf', metadata: { uploadedBy: 'u1', sha256: 'x' } });
    expect((await fs.read(p)).toString()).toBe('%PDF-1 lần 1');
    await fs.save(p, Buffer.from('lần 2'), { contentType: 'application/pdf' });
    expect((await fs.read(p)).toString()).toBe('lần 2');
    const meta = JSON.parse(readFileSync(join(root, 'tenants/ftu/proposal/dx1/abc123.meta.json'), 'utf8'));
    expect(meta).toMatchObject({ contentType: 'application/pdf', size: Buffer.byteLength('lần 2') });
    expect(readdirSync(join(root, 'tenants/ftu/proposal/dx1')).filter((f) => f.startsWith('.tmp-'))).toEqual([]);
    await fs.remove(p);
    await fs.remove(p); // không lỗi khi không còn
    expect(existsSync(join(root, 'tenants/ftu/proposal/dx1/abc123'))).toBe(false);
    await expect(fs.read(p)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it('chặn đường dẫn thoát khỏi thư mục gốc hoặc ký tự lạ', async () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'a//b', 'a/.hidden', 'C:\\x', 'a\\..\\..\\x','a/b c', 'a/x.meta.json', '']) {
      await expect(fs.save(bad, Buffer.from('x'), { contentType: 'text/plain' }), bad).rejects.toThrow(/không hợp lệ/);
      await expect(fs.read(bad), bad).rejects.toThrow(/không hợp lệ/);
    }
  });
});
