/**
 * Bản Local của port FileStore: lưu tệp trên ổ đĩa máy chủ của trường (L4 — ADR-0003).
 * - Đường dẫn chỉ gồm ký tự an toàn; chặn "..", đường dẫn tuyệt đối, ký tự lạ → không thoát ra ngoài thư mục gốc.
 * - Ghi nguyên tử: ghi tệp tạm rồi đổi tên, không để lại tệp dở dang khi mất điện / lỗi giữa chừng.
 * - Siêu dữ liệu (contentType, người tải, sha256) lưu kèm ở tệp ".meta.json" — giúp sao lưu / kiểm tra độc lập với CSDL.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { FileStore } from './filestore';

export class FileNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(path: string) {
    super(`Không tìm thấy tệp: ${path}`);
  }
}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/;

export function diskFileStore(rootDir: string): FileStore {
  const root = resolve(rootDir);

  const locate = (path: string) => {
    const segs = path.split('/');
    if (segs.length === 0 || segs.length > 12 || segs.some((s) => !SEGMENT.test(s) || s.endsWith('.meta.json') || s.includes('..'))) {
      throw new Error(`Đường dẫn tệp không hợp lệ: ${path}`);
    }
    const full = resolve(root, ...segs);
    if (!full.startsWith(root + sep)) throw new Error(`Đường dẫn tệp không hợp lệ: ${path}`);
    return full;
  };

  const writeAtomic = async (full: string, data: Buffer | string) => {
    const tmp = join(dirname(full), `.tmp-${randomBytes(6).toString('hex')}`);
    await writeFile(tmp, data, { flag: 'wx' });
    try {
      await rename(tmp, full);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  };

  return {
    kind: 'disk',
    async save(path, data, opts) {
      const full = locate(path);
      await mkdir(dirname(full), { recursive: true });
      await writeAtomic(full, data);
      await writeAtomic(`${full}.meta.json`, JSON.stringify({ contentType: opts.contentType, size: data.length, savedAt: new Date().toISOString(), metadata: opts.metadata ?? {} }, null, 1));
    },
    async read(path) {
      const full = locate(path);
      try {
        return await readFile(full);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new FileNotFoundError(path);
        throw e;
      }
    },
    async remove(path) {
      const full = locate(path);
      await rm(full, { force: true });
      await rm(`${full}.meta.json`, { force: true });
    },
  };
}
