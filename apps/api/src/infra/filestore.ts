/** Port FileStore — lưu tệp minh chứng (ADR-0003). Bản Online: Cloud Storage; bản Local: ổ đĩa / MinIO (L4). */
export interface FileStore {
  readonly kind: 'gcs' | 'disk' | 's3';
  save(path: string, data: Buffer, opts: { contentType: string; metadata?: Record<string, string> }): Promise<void>;
  read(path: string): Promise<Buffer>;
  /** Không báo lỗi nếu tệp không tồn tại. */
  remove(path: string): Promise<void>;
}
