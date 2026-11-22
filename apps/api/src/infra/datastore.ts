/**
 * Port DataStore — tập con API kho tài liệu mà nghiệp vụ AI-SRM sử dụng (ADR-0003).
 *
 * Mã nghiệp vụ CHỈ dùng các kiểu ở đây, không import firebase-admin. Hai bản cài đặt:
 *  - Firestore (bản Online)  — infra/firebase.ts, bọc trực tiếp Admin SDK;
 *  - PostgreSQL (bản Local)  — infra/postgres.ts (JSONB, giai đoạn L2).
 * Ngữ nghĩa theo Firestore: đường dẫn collection/doc lồng nhau, set(merge), update với khóa "a.b",
 * giao dịch đọc-trước-ghi-sau, increment nguyên tử. Bộ test tích hợp chạy trên cả hai bản để bảo đảm giống nhau.
 */

export type DocData = Record<string, any>;
export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';

export interface DocSnap {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: DocRef;
  data(): DocData | undefined;
  /** Đọc một trường, hỗ trợ đường dẫn "a.b". */
  get(fieldPath: string): any;
}

/** Bản ghi trả về từ truy vấn — luôn tồn tại. */
export interface QueryDocSnap extends DocSnap {
  readonly exists: true;
  data(): DocData;
}

export interface QuerySnap {
  readonly docs: QueryDocSnap[];
  readonly empty: boolean;
  readonly size: number;
}

export interface CountQuery {
  get(): Promise<{ data(): { count: number } }>;
}

export interface Query {
  where(fieldPath: string, op: WhereOp, value: unknown): Query;
  orderBy(fieldPath: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  startAfter(...fieldValues: unknown[]): Query;
  count(): CountQuery;
  get(): Promise<QuerySnap>;
}

export interface CollectionRef extends Query {
  readonly id: string;
  readonly path: string;
  doc(id?: string): DocRef;
  add(data: DocData): Promise<DocRef>;
}

export interface SetOptions {
  merge?: boolean;
}

export interface DocRef {
  readonly id: string;
  readonly path: string;
  collection(name: string): CollectionRef;
  get(): Promise<DocSnap>;
  set(data: DocData, options?: SetOptions): Promise<unknown>;
  update(data: DocData): Promise<unknown>;
  create(data: DocData): Promise<unknown>;
  delete(): Promise<unknown>;
}

/** Giao dịch: mọi lệnh đọc phải đứng trước mọi lệnh ghi (như Firestore). */
export interface Tx {
  get(ref: DocRef): Promise<DocSnap>;
  get(query: Query): Promise<QuerySnap>;
  set(ref: DocRef, data: DocData, options?: SetOptions): Tx;
  update(ref: DocRef, data: DocData): Tx;
  create(ref: DocRef, data: DocData): Tx;
  delete(ref: DocRef): Tx;
}

export interface WriteBatch {
  set(ref: DocRef, data: DocData, options?: SetOptions): WriteBatch;
  update(ref: DocRef, data: DocData): WriteBatch;
  create(ref: DocRef, data: DocData): WriteBatch;
  delete(ref: DocRef): WriteBatch;
  commit(): Promise<unknown>;
}

export interface DataStore {
  readonly kind: 'firestore' | 'postgres';
  collection(path: string): CollectionRef;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  batch(): WriteBatch;
  /** Giá trị đặc biệt: cộng dồn nguyên tử khi ghi. */
  increment(n: number): unknown;
  close?(): Promise<void>;
  /** Chỉ cho seed / test: xóa sạch dữ liệu (bản PostgreSQL từ chối nếu CSDL không phải _test / _dev). */
  reset?(): Promise<void>;
}
