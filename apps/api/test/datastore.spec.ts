/**
 * Kiểm thử "tương thích" của port DataStore (ADR-0003): cùng một bộ kịch bản chạy trên Firestore emulator
 * và trên PostgreSQL (DATA_BACKEND=postgres). Bản nào lệch ngữ nghĩa Firestore thì test đỏ.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.FIREBASE_PROJECT_ID ??= 'demo-aisrm';

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db, type CollectionRef } from '../src/infra';

const root = () => db().collection('tenants').doc(`ds-${randomUUID().slice(0, 8)}`);
const ids = (s: { docs: { id: string }[] }) => s.docs.map((d) => d.id);

async function fill(col: CollectionRef, rows: Record<string, Record<string, unknown>>) {
  const b = db().batch();
  for (const [id, data] of Object.entries(rows)) b.set(col.doc(id), data);
  await b.commit();
}

describe(`DataStore (${db().kind})`, () => {
  it('đọc / ghi: set, merge sâu, update khóa "a.b", create trùng, update tài liệu thiếu, delete', async () => {
    const t = root();
    const ref = t.collection('items').doc('a');
    expect((await ref.get()).exists).toBe(false);
    await ref.set({ x: 1, nested: { a: 1, b: { c: 1 } }, arr: [1, 2], skip: undefined });
    let s = await ref.get();
    expect(s.data()).toEqual({ x: 1, nested: { a: 1, b: { c: 1 } }, arr: [1, 2] });
    expect(s.get('nested.b.c')).toBe(1);

    await ref.set({ nested: { b: { d: 2 } }, arr: [3] }, { merge: true });
    s = await ref.get();
    expect(s.data()).toEqual({ x: 1, nested: { a: 1, b: { c: 1, d: 2 } }, arr: [3] });

    await ref.update({ 'nested.b': { e: 5 }, 'deep.new.key': 'v', x: db().increment(4) });
    s = await ref.get();
    expect(s.data()).toEqual({ x: 5, nested: { a: 1, b: { e: 5 } }, arr: [3], deep: { new: { key: 'v' } } });

    await ref.set({ only: true });
    expect((await ref.get()).data()).toEqual({ only: true });

    await expect(ref.create({ y: 1 })).rejects.toMatchObject({ code: 6 });
    await expect(t.collection('items').doc('missing').update({ y: 1 })).rejects.toMatchObject({ code: 5 });

    const added = await t.collection('items').add({ z: 1 });
    expect(added.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(added.path).toBe(`${t.path}/items/${added.id}`);

    await ref.delete();
    expect((await ref.get()).exists).toBe(false);
    await ref.delete(); // xóa tài liệu không tồn tại: không lỗi
  });

  it('dữ liệu trả về là bản sao, sửa không ảnh hưởng lần đọc sau', async () => {
    const ref = root().collection('items').doc('a');
    await ref.set({ o: { k: 1 }, l: [1] });
    const s = await ref.get();
    s.data()!.o.k = 99;
    (s.get('l') as number[]).push(2);
    expect(s.data()).toEqual({ o: { k: 1 }, l: [1] });
  });

  it('truy vấn: ==, in, array-contains(-any), phạm vi, chỉ con trực tiếp của collection', async () => {
    const t = root();
    const col = t.collection('p');
    await fill(col, {
      a: { status: 'OPEN', n: 1, tags: ['x', 'y'], unit: { id: 'u1' } },
      b: { status: 'CLOSED', n: 2, tags: ['y'], unit: { id: 'u2' } },
      c: { status: 'OPEN', n: 3, tags: [], unit: { id: 'u1' } },
      d: { status: 'OPEN', n: '3', tags: 'x', flag: null },
    });
    await col.doc('a').collection('p').doc('child').set({ status: 'OPEN' }); // không được lẫn vào
    await t.collection('other').doc('e').set({ status: 'OPEN' });

    expect(ids(await col.where('status', '==', 'OPEN').get())).toEqual(['a', 'c', 'd']);
    expect(ids(await col.where('unit.id', '==', 'u1').get())).toEqual(['a', 'c']);
    expect(ids(await col.where('status', 'in', ['CLOSED', 'NONE']).get())).toEqual(['b']);
    expect(ids(await col.where('tags', 'array-contains', 'x').get())).toEqual(['a']); // 'd' có tags là chuỗi
    expect(ids(await col.where('tags', 'array-contains-any', ['x', 'y']).get())).toEqual(['a', 'b']);
    expect(ids(await col.where('n', '>=', 2).get())).toEqual(['b', 'c']); // '3' là chuỗi → không so với số
    expect(ids(await col.where('n', '<', '9').get())).toEqual(['d']);
    expect(ids(await col.where('flag', '==', null).get())).toEqual(['d']);
    expect(ids(await col.where('status', '==', 'OPEN').where('n', '>', 1).get())).toEqual(['c']);
    expect((await col.where('status', '==', 'OPEN').count().get()).data().count).toBe(3);
    expect((await col.count().get()).data().count).toBe(4);
  });

  it('sắp xếp: bỏ tài liệu thiếu trường, chuỗi theo byte UTF-8, khóa phụ __name__, limit', async () => {
    const col = root().collection('s');
    await fill(col, {
      d1: { k: 'b', at: '2026-01-02' },
      d2: { k: 'a', at: '2026-01-01' },
      d3: { k: 'B', at: '2026-01-02' },
      d4: { k: 'á', at: '2026-01-03' },
      d5: { other: 1 },
      d6: { k: 10 },
    });
    // Firestore: số đứng trước chuỗi; chuỗi so theo byte ('B' < 'a' < 'b' < 'á')
    expect(ids(await col.orderBy('k').get())).toEqual(['d6', 'd3', 'd2', 'd1', 'd4']);
    expect(ids(await col.orderBy('at', 'desc').get())).toEqual(['d4', 'd3', 'd1', 'd2']);
    expect(ids(await col.orderBy('at', 'desc').limit(2).get())).toEqual(['d4', 'd3']);
    expect(ids(await col.orderBy('at').orderBy('__name__').get())).toEqual(['d2', 'd1', 'd3', 'd4']);
    expect(ids(await col.limit(3).get())).toEqual(['d1', 'd2', 'd3']); // không orderBy → theo id
  });

  it('phân trang startAfter(giá trị, doc) ổn định khi trùng giá trị', async () => {
    const col = root().collection('pg');
    const rows: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 7; i++) rows[`r${i}`] = { updatedAt: `2026-11-0${1 + Math.floor(i / 3)}` };
    await fill(col, rows);
    const seen: string[] = [];
    let q = col.orderBy('updatedAt').orderBy('__name__').limit(3);
    for (let page = 0; page < 5; page++) {
      const s = await q.get();
      if (s.empty) break;
      seen.push(...ids(s));
      const last = s.docs[s.docs.length - 1];
      q = col.orderBy('updatedAt').orderBy('__name__').limit(3).startAfter(last.get('updatedAt'), col.doc(last.id));
    }
    expect(seen).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    const since = await col.where('updatedAt', '>=', '2026-11-02').orderBy('updatedAt').orderBy('__name__').get();
    expect(ids(since)).toEqual(['r3', 'r4', 'r5', 'r6']);
  });

  it('increment nguyên tử khi ghi đồng thời', async () => {
    const ref = root().collection('c').doc('counter');
    await Promise.all(Array.from({ length: 20 }, () => ref.set({ n: db().increment(1) }, { merge: true })));
    expect((await ref.get()).get('n')).toBe(20);
  });

  it('giao dịch: đọc trước ghi sau, tuần tự hóa cập nhật đồng thời, hoàn tác khi lỗi', async () => {
    const t = root();
    const ref = t.collection('c').doc('seq');
    await ref.set({ v: 0 });
    // 10 giao dịch đọc-sửa-ghi chạy song song: không được mất cập nhật nào
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db().runTransaction(async (tx) => {
          const s = await tx.get(ref);
          tx.update(ref, { v: (s.get('v') as number) + 1 });
        }),
      ),
    );
    expect((await ref.get()).get('v')).toBe(10);

    // Lỗi trong giao dịch → không ghi gì
    const other = t.collection('c').doc('other');
    await expect(
      db().runTransaction(async (tx) => {
        await tx.get(ref);
        tx.set(other, { x: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await other.get()).exists).toBe(false);

    // create trùng trong giao dịch → hoàn tác toàn bộ
    await expect(
      db().runTransaction(async (tx) => {
        tx.set(other, { x: 1 });
        tx.create(ref, { v: -1 });
      }),
    ).rejects.toMatchObject({ code: 6 });
    expect((await other.get()).exists).toBe(false);
    expect((await ref.get()).get('v')).toBe(10);

    // Đọc truy vấn trong giao dịch
    const n = await db().runTransaction(async (tx) => (await tx.get(t.collection('c').where('v', '>=', 0))).size);
    expect(n).toBe(1);
  });

  it('duyệt đồng thời: chỉ một giao dịch thắng khi cùng kiểm tra version', async () => {
    const ref = root().collection('proposals').doc('p1');
    await ref.set({ status: 'SUBMITTED', version: 3 });
    const approve = (by: string) =>
      db().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.get('version') !== 3) return 'CONFLICT';
        tx.update(ref, { status: 'APPROVED', version: 4, by });
        return 'OK';
      });
    const results = await Promise.all(['u1', 'u2', 'u3', 'u4', 'u5'].map(approve));
    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r === 'CONFLICT')).toHaveLength(4);
    expect((await ref.get()).get('version')).toBe(4);
  });

  it('batch: ghi nhiều tài liệu một lần, lỗi thì không ghi gì', async () => {
    const col = root().collection('b');
    await col.doc('exists').set({ a: 1 });
    const bad = db().batch();
    bad.set(col.doc('n1'), { a: 1 });
    bad.update(col.doc('nope'), { a: 1 });
    await expect(bad.commit()).rejects.toMatchObject({ code: 5 });
    expect((await col.doc('n1').get()).exists).toBe(false);

    const ok = db().batch();
    ok.set(col.doc('n1'), { a: 1 }).update(col.doc('exists'), { a: db().increment(2) }).delete(col.doc('none'));
    await ok.commit();
    expect((await col.doc('exists').get()).get('a')).toBe(3);
    expect((await col.count().get()).data().count).toBe(2);
  });
});
