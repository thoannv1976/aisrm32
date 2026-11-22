/**
 * Bản cài đặt Local của port DataStore trên PostgreSQL (phương án A2 — ADR-0003).
 *
 * Mô phỏng đúng tập con ngữ nghĩa Firestore mà nghiệp vụ dùng:
 *  - đường dẫn collection/doc lồng nhau; truy vấn chỉ trên con trực tiếp của một collection;
 *  - so sánh theo kiểu (số chỉ so với số, chuỗi so theo byte UTF-8 như Firestore — collation "C");
 *  - orderBy loại tài liệu thiếu trường; luôn thêm __name__ làm khóa phụ; startAfter theo bộ giá trị;
 *  - set / set(merge sâu) / update (khóa "a.b") / create (lỗi nếu đã có) / delete; increment nguyên tử;
 *  - giao dịch: đọc trước – ghi sau, khóa bi quan theo tài liệu (advisory lock + FOR UPDATE), tự thử lại khi deadlock.
 * Mọi giá trị người dùng đi qua tham số ($n), không ghép chuỗi SQL.
 */
import { randomInt } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { CollectionRef, CountQuery, DataStore, DocData, DocRef, DocSnap, Query, QueryDocSnap, QuerySnap, SetOptions, Tx, WhereOp, WriteBatch } from './datastore';
import { MIGRATIONS } from './postgres-schema';

/** Lỗi mang mã gRPC giống Firestore (5 NOT_FOUND, 6 ALREADY_EXISTS, 9 FAILED_PRECONDITION, 3 INVALID_ARGUMENT). */
export class DataStoreError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'DataStoreError';
  }
}

class Increment {
  constructor(readonly n: number) {}
}

type Queryable = Pick<PoolClient, 'query'>;

// ---------- tiện ích giá trị ----------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Increment) && Object.getPrototypeOf(v) === Object.prototype;

/** Bỏ trường undefined (như ignoreUndefinedProperties), chuẩn hóa Date → ISO. */
function clean(v: unknown): unknown {
  if (v instanceof Increment) return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map(clean);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new DataStoreError(3, 'Không lưu được số NaN/Infinity.');
  return v;
}

/** Thay mọi Increment bằng giá trị số dựa trên giá trị hiện có. */
function resolve(v: unknown, current: unknown): unknown {
  if (v instanceof Increment) return (typeof current === 'number' ? current : 0) + v.n;
  if (Array.isArray(v)) return v.map((x) => resolve(x, undefined));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = resolve(x, undefined);
    return out;
  }
  return v;
}

function mergeDeep(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v)) out[k] = mergeDeep(isPlainObject(current[k]) ? (current[k] as Record<string, unknown>) : {}, v);
    else out[k] = resolve(v, current[k]);
  }
  return out;
}

const splitPath = (fieldPath: string) => fieldPath.split('.');

function getAt(obj: unknown, path: string[]): unknown {
  let cur: any = obj;
  for (const p of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function applyUpdate(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(current);
  for (const [key, v] of Object.entries(patch)) {
    const path = splitPath(key);
    let node: Record<string, unknown> = out;
    for (const seg of path.slice(0, -1)) {
      if (!isPlainObject(node[seg])) node[seg] = {};
      node = node[seg] as Record<string, unknown>;
    }
    const last = path[path.length - 1];
    node[last] = resolve(v, node[last]);
  }
  return out;
}

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const autoId = () => Array.from({ length: 20 }, () => AUTO_ID_CHARS[randomInt(AUTO_ID_CHARS.length)]).join('');

function assertSegment(s: string) {
  if (!s || s.includes('/')) throw new DataStoreError(3, `Tên không hợp lệ trong đường dẫn: "${s}"`);
}

// ---------- snapshot ----------

class Snap implements DocSnap {
  constructor(
    readonly ref: PgDocRef,
    private readonly raw: DocData | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return this.raw !== undefined;
  }
  data(): DocData | undefined {
    return this.raw === undefined ? undefined : structuredClone(this.raw);
  }
  get(fieldPath: string) {
    const v = getAt(this.raw, splitPath(fieldPath));
    return v !== null && typeof v === 'object' ? structuredClone(v) : v;
  }
}

// ---------- biên dịch truy vấn ----------

interface Filter {
  path: string[];
  op: WhereOp;
  value: unknown;
}
interface Order {
  field: string; // '__name__' hoặc đường dẫn "a.b"
  dir: 'asc' | 'desc';
}
interface QueryState {
  parent: string;
  filters: Filter[];
  orders: Order[];
  limit?: number;
  cursor?: unknown[];
}

const RANGE: WhereOp[] = ['<', '<=', '>', '>='];
const INEQUALITY: WhereOp[] = [...RANGE, '!=', 'not-in'];

class Sql {
  params: unknown[] = [];
  p(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }
  /** Biểu thức JSONB của trường. */
  field(path: string[]) {
    return `(data #> ${this.p(path)}::text[])`;
  }
  json(v: unknown) {
    return `${this.p(JSON.stringify(v))}::jsonb`;
  }
}

const TYPE_RANK = (f: string) =>
  `(case jsonb_typeof(${f}) when 'null' then 0 when 'boolean' then 1 when 'number' then 2 when 'string' then 3 when 'array' then 4 when 'object' then 5 end)`;
const NUM = (f: string) => `(case when jsonb_typeof(${f}) = 'number' then (${f})::numeric end)`;
const STR = (f: string) => `((case when jsonb_typeof(${f}) = 'string' then ${f} #>> '{}' end) collate "C")`;

function rankOf(v: unknown): number {
  if (v === null) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 3;
  if (Array.isArray(v)) return 4;
  return 5;
}

/** Biểu thức so sánh cùng kiểu: f <op> v (chỉ khi cùng loại giá trị, như Firestore). */
function typedCompare(s: Sql, f: string, op: string, v: unknown): string {
  // PostgreSQL không bảo đảm thứ tự đánh giá của AND → dùng CASE để chỉ ép kiểu khi đúng loại.
  if (typeof v === 'number') return `coalesce(case when jsonb_typeof(${f}) = 'number' then (${f})::numeric ${op} ${s.p(v)}::numeric end, false)`;
  if (typeof v === 'string') return `coalesce(case when jsonb_typeof(${f}) = 'string' then (${f} #>> '{}') collate "C" ${op} ${s.p(v)}::text collate "C" end, false)`;
  if (v === null) return op.includes('=') ? `(${f} = 'null'::jsonb)` : 'false';
  return `coalesce(case when jsonb_typeof(${f}) = ${s.p(jsonbType(v))} then ${f} ${op} ${s.json(v)} end, false)`;
}

function jsonbType(v: unknown) {
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  return 'object';
}

function compileFilter(s: Sql, flt: Filter): string {
  const f = s.field(flt.path);
  const v = flt.value;
  switch (flt.op) {
    case '==':
      return `(${f} = ${s.json(v)})`;
    case '!=':
      return `(${f} is not null and ${f} <> ${s.json(v)})`;
    case 'in':
    case 'not-in': {
      if (!Array.isArray(v)) throw new DataStoreError(3, `Toán tử ${flt.op} cần mảng giá trị.`);
      const any = `(${f} = any(${s.p(v.map((x) => JSON.stringify(x)))}::jsonb[]))`;
      return flt.op === 'in' ? any : `(${f} is not null and ${f} <> 'null'::jsonb and not ${any})`;
    }
    case 'array-contains':
      return `(jsonb_typeof(${f}) = 'array' and exists (select 1 from jsonb_array_elements(${f}) e where e = ${s.json(v)}))`;
    case 'array-contains-any': {
      if (!Array.isArray(v)) throw new DataStoreError(3, 'Toán tử array-contains-any cần mảng giá trị.');
      return `(jsonb_typeof(${f}) = 'array' and exists (select 1 from jsonb_array_elements(${f}) e where e = any(${s.p(v.map((x) => JSON.stringify(x)))}::jsonb[])))`;
    }
    default:
      if (RANGE.includes(flt.op)) return typedCompare(s, f, flt.op, v);
      throw new DataStoreError(3, `Toán tử không hỗ trợ: ${flt.op}`);
  }
}

/** Thứ tự đầy đủ: orderBy của người gọi + ngầm định như Firestore (trường bất đẳng thức, rồi __name__). */
function effectiveOrders(q: QueryState): Order[] {
  const orders = [...q.orders];
  if (orders.length === 0) {
    const ineq = q.filters.find((f) => INEQUALITY.includes(f.op));
    if (ineq) orders.push({ field: ineq.path.join('.'), dir: 'asc' });
  }
  if (!orders.some((o) => o.field === '__name__')) orders.push({ field: '__name__', dir: orders.length ? orders[orders.length - 1].dir : 'asc' });
  return orders;
}

function cursorValue(v: unknown): unknown {
  if (v && typeof v === 'object' && 'id' in v && 'path' in v && !isPlainObject(v)) return (v as { id: string }).id; // DocRef
  return v;
}

function compileQuery(q: QueryState, mode: 'select' | 'count', forUpdate = false): { text: string; params: unknown[] } {
  const s = new Sql();
  const where = [`parent = ${s.p(q.parent)}`, ...q.filters.map((f) => compileFilter(s, f))];
  const orders = effectiveOrders(q);
  const orderSql: string[] = [];
  for (const o of orders) {
    const dir = o.dir === 'desc' ? 'desc' : 'asc';
    if (o.field === '__name__') {
      orderSql.push(`id collate "C" ${dir}`);
      continue;
    }
    const f = s.field(splitPath(o.field));
    where.push(`${f} is not null`); // Firestore: orderBy loại tài liệu không có trường
    orderSql.push(`${TYPE_RANK(f)} ${dir}`, `${NUM(f)} ${dir}`, `${STR(f)} ${dir}`, `${f} ${dir}`);
  }
  if (q.cursor?.length) {
    // startAfter(v0, v1, …): bộ giá trị (theo hướng sắp xếp) lớn hơn hẳn con trỏ.
    const parts: string[] = [];
    const eqs: string[] = [];
    q.cursor.forEach((raw, i) => {
      const o = orders[i];
      if (!o) throw new DataStoreError(3, 'startAfter có nhiều giá trị hơn số trường orderBy.');
      const v = cursorValue(raw);
      const gt = o.dir === 'desc' ? '<' : '>';
      let after: string;
      let eq: string;
      if (o.field === '__name__') {
        const pv = s.p(String(v));
        after = `(id collate "C" ${gt} ${pv}::text collate "C")`;
        eq = `(id = ${pv}::text)`;
      } else {
        const f = s.field(splitPath(o.field));
        const r = s.p(rankOf(v));
        after = `(${TYPE_RANK(f)} ${gt} ${r}::int or (${TYPE_RANK(f)} = ${r}::int and ${typedCompare(s, f, gt, v)}))`;
        eq = typedCompare(s, f, '=', v);
      }
      parts.push(`(${[...eqs, after].join(' and ')})`);
      eqs.push(eq);
    });
    where.push(`(${parts.join(' or ')})`);
  }
  const limit = q.limit !== undefined ? ` limit ${s.p(q.limit)}::int` : '';
  const body = `from docs where ${where.join(' and ')} order by ${orderSql.join(', ')}${limit}`;
  if (mode === 'count') return { text: `select count(*)::int as n from (select 1 ${body}) t`, params: s.params };
  return { text: `select id, data ${body}${forUpdate ? ' for update' : ''}`, params: s.params };
}

// ---------- tham chiếu ----------

class PgQuery implements Query {
  constructor(
    protected readonly store: PgStore,
    protected readonly state: QueryState,
  ) {}
  protected next(patch: Partial<QueryState>): PgQuery {
    return new PgQuery(this.store, { ...this.state, ...patch });
  }
  where(fieldPath: string, op: WhereOp, value: unknown): Query {
    return this.next({ filters: [...this.state.filters, { path: splitPath(fieldPath), op, value: clean(value) }] });
  }
  orderBy(fieldPath: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return this.next({ orders: [...this.state.orders, { field: fieldPath, dir: direction }] });
  }
  limit(n: number): Query {
    return this.next({ limit: n });
  }
  startAfter(...fieldValues: unknown[]): Query {
    return this.next({ cursor: fieldValues });
  }
  count(): CountQuery {
    return {
      get: async () => {
        const { text, params } = compileQuery(this.state, 'count');
        const r = await this.store.query(text, params);
        const count = r.rows[0].n as number;
        return { data: () => ({ count }) };
      },
    };
  }
  get(): Promise<QuerySnap> {
    return this.store.runQuery(this.store.pool, this.state, false);
  }
  /** Dùng nội bộ (giao dịch). */
  get queryState() {
    return this.state;
  }
}

class PgCollection extends PgQuery implements CollectionRef {
  constructor(
    store: PgStore,
    readonly path: string,
  ) {
    super(store, { parent: path, filters: [], orders: [] });
  }
  get id() {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  doc(id?: string): DocRef {
    const docId = id ?? autoId();
    assertSegment(docId);
    return new PgDocRef(this.store, this.path, docId);
  }
  async add(data: DocData): Promise<DocRef> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

class PgDocRef implements DocRef {
  constructor(
    private readonly store: PgStore,
    readonly parent: string,
    readonly id: string,
  ) {}
  get path() {
    return `${this.parent}/${this.id}`;
  }
  collection(name: string): CollectionRef {
    assertSegment(name);
    return new PgCollection(this.store, `${this.path}/${name}`);
  }
  async get(): Promise<DocSnap> {
    await this.store.ready();
    const r = await this.store.pool.query('select data from docs where path = $1', [this.path]);
    return new Snap(this, r.rows[0]?.data);
  }
  set(data: DocData, options?: SetOptions) {
    return this.store.write([{ kind: 'set', ref: this, data: clean(data) as DocData, merge: !!options?.merge }]);
  }
  update(data: DocData) {
    return this.store.write([{ kind: 'update', ref: this, data: clean(data) as DocData }]);
  }
  create(data: DocData) {
    return this.store.write([{ kind: 'create', ref: this, data: clean(data) as DocData }]);
  }
  delete() {
    return this.store.write([{ kind: 'delete', ref: this }]);
  }
}

type WriteOp =
  | { kind: 'set'; ref: PgDocRef; data: DocData; merge: boolean }
  | { kind: 'update' | 'create'; ref: PgDocRef; data: DocData }
  | { kind: 'delete'; ref: PgDocRef };

function asPgRef(ref: DocRef): PgDocRef {
  if (!(ref instanceof PgDocRef)) throw new DataStoreError(3, 'Tham chiếu tài liệu không thuộc kho PostgreSQL này.');
  return ref;
}

const lockDoc = (c: Queryable, path: string) => c.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [path]);

// ---------- kho ----------

export interface PostgresConfig {
  databaseUrl: string;
  /** Số kết nối tối đa (mặc định 10). */
  maxConnections?: number;
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected
const MAX_ATTEMPTS = 6;

class PgStore implements DataStore {
  readonly kind = 'postgres' as const;
  readonly pool: Pool;
  private migrated?: Promise<void>;

  constructor(cfg: PostgresConfig) {
    this.pool = new Pool({ connectionString: cfg.databaseUrl, max: cfg.maxConnections ?? 10, allowExitOnIdle: true });
  }

  ready(): Promise<void> {
    this.migrated ??= migrate(this.pool).catch((e) => {
      this.migrated = undefined;
      throw e;
    });
    return this.migrated;
  }

  async query(text: string, params: unknown[]) {
    await this.ready();
    return this.pool.query(text, params);
  }

  collection(path: string): CollectionRef {
    path.split('/').forEach(assertSegment);
    if (path.split('/').length % 2 === 0) throw new DataStoreError(3, `"${path}" là đường dẫn tài liệu, không phải collection.`);
    return new PgCollection(this, path);
  }

  increment(n: number) {
    return new Increment(n);
  }

  async runQuery(c: Queryable, state: QueryState, forUpdate: boolean): Promise<QuerySnap> {
    await this.ready();
    const { text, params } = compileQuery(state, 'select', forUpdate);
    const r = await c.query(text, params);
    const docs = r.rows.map((row) => new Snap(new PgDocRef(this, state.parent, row.id), row.data) as QueryDocSnap);
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  /** Chạy fn trong một giao dịch PostgreSQL, tự thử lại khi deadlock / xung đột tuần tự. */
  async inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    await this.ready();
    for (let attempt = 1; ; attempt++) {
      const c = await this.pool.connect();
      try {
        await c.query('begin');
        const out = await fn(c);
        await c.query('commit');
        return out;
      } catch (e) {
        await c.query('rollback').catch(() => undefined);
        const code = (e as { code?: string }).code;
        if (code && RETRYABLE.has(code) && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 10 * 2 ** attempt + randomInt(20)));
          continue;
        }
        throw e;
      } finally {
        c.release();
      }
    }
  }

  async applyWrites(c: Queryable, ops: WriteOp[]) {
    for (const op of ops) {
      const path = op.ref.path;
      await lockDoc(c, path);
      const r = await c.query('select data from docs where path = $1', [path]);
      const cur: DocData | undefined = r.rows[0]?.data;
      let next: DocData | null;
      switch (op.kind) {
        case 'delete':
          next = null;
          break;
        case 'create':
          if (cur) throw new DataStoreError(6, `Tài liệu đã tồn tại: ${path}`);
          next = resolve(op.data, undefined) as DocData;
          break;
        case 'update':
          if (!cur) throw new DataStoreError(5, `Không tìm thấy tài liệu để cập nhật: ${path}`);
          next = applyUpdate(cur, op.data);
          break;
        case 'set':
          next = op.merge ? mergeDeep(cur ?? {}, op.data) : (resolve(op.data, undefined) as DocData);
          break;
      }
      if (next === null) await c.query('delete from docs where path = $1', [path]);
      else
        await c.query(
          `insert into docs (path, parent, id, data) values ($1, $2, $3, $4::jsonb)
           on conflict (path) do update set data = excluded.data, updated_at = now()`,
          [path, op.ref.parent, op.ref.id, JSON.stringify(next)],
        );
    }
  }

  async write(ops: WriteOp[]) {
    await this.inTx((c) => this.applyWrites(c, ops));
  }

  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.inTx(async (c) => {
      const ops: WriteOp[] = [];
      const guardRead = () => {
        if (ops.length) throw new DataStoreError(3, 'Giao dịch yêu cầu mọi lệnh đọc đứng trước mọi lệnh ghi.');
      };
      const tx: Tx = {
        get: (async (target: DocRef | Query) => {
          guardRead();
          if (target instanceof PgDocRef) {
            await lockDoc(c, target.path);
            const r = await c.query('select data from docs where path = $1 for update', [target.path]);
            return new Snap(target, r.rows[0]?.data);
          }
          if (target instanceof PgQuery) return this.runQuery(c, target.queryState, true);
          throw new DataStoreError(3, 'Đối tượng đọc không thuộc kho PostgreSQL này.');
        }) as Tx['get'],
        set(ref, data, options) {
          ops.push({ kind: 'set', ref: asPgRef(ref), data: clean(data) as DocData, merge: !!options?.merge });
          return tx;
        },
        update(ref, data) {
          ops.push({ kind: 'update', ref: asPgRef(ref), data: clean(data) as DocData });
          return tx;
        },
        create(ref, data) {
          ops.push({ kind: 'create', ref: asPgRef(ref), data: clean(data) as DocData });
          return tx;
        },
        delete(ref) {
          ops.push({ kind: 'delete', ref: asPgRef(ref) });
          return tx;
        },
      };
      const out = await fn(tx);
      await this.applyWrites(c, ops);
      return out;
    });
  }

  batch(): WriteBatch {
    const ops: WriteOp[] = [];
    let committed = false;
    const b: WriteBatch = {
      set(ref, data, options) {
        ops.push({ kind: 'set', ref: asPgRef(ref), data: clean(data) as DocData, merge: !!options?.merge });
        return b;
      },
      update(ref, data) {
        ops.push({ kind: 'update', ref: asPgRef(ref), data: clean(data) as DocData });
        return b;
      },
      create(ref, data) {
        ops.push({ kind: 'create', ref: asPgRef(ref), data: clean(data) as DocData });
        return b;
      },
      delete(ref) {
        ops.push({ kind: 'delete', ref: asPgRef(ref) });
        return b;
      },
      commit: async () => {
        if (committed) throw new DataStoreError(9, 'Batch đã được commit.');
        committed = true;
        if (ops.length) await this.write(ops);
      },
    };
    return b;
  }

  /** Xóa toàn bộ dữ liệu — chỉ cho seed / test, và chỉ với CSDL có tên kết thúc bằng _test hoặc _dev. */
  async reset() {
    await this.ready();
    const r = await this.pool.query('select current_database() as name');
    const name = String(r.rows[0].name);
    if (!/_(test|dev)$/.test(name)) throw new Error(`Từ chối xóa dữ liệu: CSDL "${name}" không phải CSDL thử (_test / _dev).`);
    await this.pool.query('truncate docs');
  }

  async close() {
    await this.pool.end();
  }
}

async function migrate(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock(727001)');
    await c.query(`create table if not exists schema_migrations (version int primary key, name text not null, applied_at timestamptz not null default now())`);
    const done = new Set((await c.query('select version from schema_migrations')).rows.map((r) => r.version as number));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await c.query('begin');
      try {
        await c.query(m.sql);
        await c.query('insert into schema_migrations (version, name) values ($1, $2)', [m.version, m.name]);
        await c.query('commit');
      } catch (e) {
        await c.query('rollback');
        throw new Error(`Migration ${m.version} (${m.name}) lỗi: ${(e as Error).message}`);
      }
    }
  } finally {
    await c.query('select pg_advisory_unlock(727001)').catch(() => undefined);
    c.release();
  }
}

export function postgresStore(cfg: PostgresConfig): DataStore & { reset(): Promise<void>; ready(): Promise<void> } {
  return new PgStore(cfg);
}
