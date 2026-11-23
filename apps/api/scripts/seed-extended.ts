/**
 * Dữ liệu mẫu cho các phân hệ bổ sung (HEMIS, kinh phí, NCKH sinh viên, danh mục KH&CN).
 * Idempotent: đánh dấu đã chạy ở tenants/{id}/settings/seedExtended; bỏ qua bản ghi không tồn tại.
 * Tra người theo email trong seed-data nên dùng được cho emulator, PostgreSQL và staging.
 */
import { normalizeTitle, PUBLICATION_WORKFLOW, registryPersonUids, REGISTRY, type RegistryKind } from '@aisrm/shared';
import { db } from '../src/infra';
import { TENANTS } from './seed-data';

const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);
const year0 = () => new Date().getFullYear();

export async function seedExtended(tenantId: string): Promise<boolean> {
  const t = db().collection('tenants').doc(tenantId);
  const marker = t.collection('settings').doc('seedExtended');
  if ((await marker.get()).exists) return false;
  const tenant = TENANTS.find((x) => x.id === tenantId);
  if (!tenant || !tenant.users.some((u) => u.key === 'pi')) return false;
  const person = async (key: string) => {
    const u = tenant.users.find((x) => x.key === key)!;
    const s = await t.collection('people').where('email', '==', u.email).limit(1).get();
    return s.empty ? null : { uid: s.docs[0].id, name: u.displayName, unitId: u.unitId };
  };
  const [pi, r2, r3, focal, unitHead, officer, student] = await Promise.all(['pi', 'researcher2', 'researcher3', 'focal', 'unitHead', 'officer', 'student'].map(person));
  if (!pi || !officer) return false;
  const units = new Map(tenant.units.map((u) => [u.id, u]));
  const unitOf = (unitId: string) => {
    const path: string[] = [unitId];
    for (let cur = units.get(unitId)?.parentId ?? null; cur; cur = units.get(cur)?.parentId ?? null) path.push(cur);
    return { unitId, unitPath: path, unitName: units.get(unitId)!.name };
  };
  const now = iso(0);
  const exists = async (col: string, id: string) => (await t.collection(col).doc(id).get()).exists;

  // 1) Thông tin HEMIS cho đề tài mẫu
  const hemis: Record<string, object> = {
    dt1: { classification: 'APPLIED', level: 'UNIVERSITY', field: 'SOCIAL', fundingSource: 'UNIVERSITY', hostAgency: 'Bộ Giáo dục và Đào tạo', evaluationResult: null, acceptanceDate: null },
    dt2: { classification: 'APPLIED', level: 'UNIVERSITY', field: 'SOCIAL', fundingSource: 'UNIVERSITY', hostAgency: 'Bộ Giáo dục và Đào tạo', evaluationResult: null, acceptanceDate: null },
    dtsv1: { classification: 'APPLIED', level: 'STUDENT', field: 'SOCIAL', fundingSource: 'UNIVERSITY', hostAgency: null, evaluationResult: null, acceptanceDate: null },
  };
  for (const [id, h] of Object.entries(hemis)) if (await exists('projects', id)) await t.collection('projects').doc(id).set({ hemis: { ...h, updatedAt: now, updatedByName: officer.name } }, { merge: true });

  // 2) Kinh phí – hợp đồng cho đề tài dt1
  if (await exists('projects', 'dt1')) {
    const lines = [
      { category: 'LABOR', amountVnd: 80_000_000, note: null },
      { category: 'TRAVEL', amountVnd: 30_000_000, note: 'Khảo sát doanh nghiệp' },
      { category: 'WORKSHOP', amountVnd: 15_000_000, note: null },
      { category: 'MANAGEMENT', amountVnd: 15_000_000, note: null },
    ];
    const ref = t.collection('projects').doc('dt1');
    const exp = [
      { category: 'TRAVEL', content: 'Khảo sát 30 doanh nghiệp xuất khẩu tại Bắc Ninh, Hải Phòng', amountVnd: 12_000_000, status: 'DISBURSED', disbursedVnd: 11_500_000, disbursedAt: date(-90), voucherNo: 'PC-0412' },
      { category: 'LABOR', content: 'Thuê khoán chuyên đề 1: tổng quan chuỗi giá trị', amountVnd: 20_000_000, status: 'APPROVED', disbursedVnd: null, disbursedAt: null, voucherNo: null },
      { category: 'WORKSHOP', content: 'Hội thảo công bố kết quả giữa kỳ', amountVnd: 8_000_000, status: 'PENDING', disbursedVnd: null, disbursedAt: null, voucherNo: null },
    ];
    for (const e of exp) {
      await ref.collection('expenses').add({ ...e, requestedBy: pi.uid, requestedByName: pi.name, requestedAt: iso(-100), decidedByName: e.status === 'PENDING' ? null : officer.name, decidedAt: e.status === 'PENDING' ? null : iso(-95), decisionNote: null });
    }
    await ref.set(
      {
        contract: { contractNo: `HĐ-${new Date().getFullYear()}/QLKH-01`, signedDate: date(-255), valueVnd: 140_000_000, fundingSource: 'Nguồn của Trường', note: null, updatedAt: now, updatedByName: officer.name },
        budgetLines: lines,
        budgetLocked: true,
        settlement: { status: 'NOT_STARTED', note: null, updatedAt: now, updatedByName: officer.name },
        financeStats: { contractValueVnd: 140_000_000, approvedVnd: 32_000_000, disbursedVnd: 11_500_000, settlement: 'NOT_STARTED' },
      },
      { merge: true },
    );
  }

  // 3) NCKH sinh viên: người hướng dẫn có cấu trúc, ngành, khóa, giải
  if (student && (await exists('proposals', 'sv1'))) {
    await t.collection('proposals').doc('sv1').set({ callLevel: 'STUDENT', supervisor: { uid: pi.uid, name: pi.name, confirmedAt: iso(-20), note: null }, major: 'Kinh doanh quốc tế', cohort: 'K62', memberUids: [student.uid, pi.uid] }, { merge: true });
    if (focal) await t.collection('proposals').doc('sv2').set({ callLevel: 'STUDENT', supervisor: { uid: focal.uid, name: focal.name, confirmedAt: iso(-70), note: null }, major: 'Kinh tế quốc tế', cohort: 'K61', memberUids: [student.uid, focal.uid] }, { merge: true });
    if (focal && (await exists('projects', 'dtsv1'))) await t.collection('projects').doc('dtsv1').set({ callLevel: 'STUDENT', supervisor: { uid: focal.uid, name: focal.name }, major: 'Kinh tế quốc tế', cohort: 'K61', memberUids: [student.uid, focal.uid] }, { merge: true });
    await t.collection('studentAwards').doc('sv2').set({ proposalId: 'sv2', callId: 'call-sv', prize: 'SECOND', decisionNo: 'QĐ-mẫu/NCKHSV', note: 'Dữ liệu mẫu', unitName: unitOf(student.unitId).unitName, major: 'Kinh tế quốc tế', cohort: 'K61', year: new Date().getFullYear(), updatedAt: now, updatedByName: officer.name });
    if (focal) {
      await t.collection('projects').doc('dtsv1').collection('supervisionLogs').add({ date: date(-30), content: 'Thống nhất nguồn dữ liệu giá cà phê (ICO, Tổng cục Hải quan), phương pháp làm sạch.', nextSteps: 'Hoàn thành bộ dữ liệu 2015–2026.', byUid: focal.uid, byName: focal.name, createdAt: iso(-30) });
      await t.collection('projects').doc('dtsv1').collection('supervisionLogs').add({ date: date(-10), content: 'Rà soát kết quả chạy thử mô hình LSTM và ARIMA; đề nghị bổ sung kiểm định độ ổn định.', nextSteps: 'So sánh sai số dự báo giữa các mô hình.', byUid: focal.uid, byName: focal.name, createdAt: iso(-10) });
    }
  }

  // 4) HEMIS cho công bố mẫu
  const pubs: Record<string, object> = {
    cb1: { volume: '312', issue: '6', pages: '45-58', issn: '1859-0012', journalScope: 'DOMESTIC', quartile: null, quartileSource: null },
    cb3: { volume: '28', issue: '3', pages: '12-27', journalScope: 'DOMESTIC', quartile: null, quartileSource: null },
    cb4: { isbn: '978-604-000-000-0', publisher: 'NXB mẫu', pages: '120-145' },
  };
  for (const [id, x] of Object.entries(pubs)) if (await exists('publications', id)) await t.collection('publications').doc(id).set(x, { merge: true });

  // 4b) Công bố đã xác nhận có đồng tác giả trong trường (mạng lưới hợp tác, tìm chuyên gia)
  type P = NonNullable<typeof pi>;
  const coPubs: { id: string; owner: P; authors: P[]; title: string; venue: string; year: number; type: string; scope: string }[] = [];
  if (unitHead && r3) coPubs.push({ id: 'cb5', owner: pi, authors: [pi, unitHead, r3], title: 'Hiệp định thương mại tự do thế hệ mới và chuỗi giá trị nông sản Việt Nam', venue: 'Tạp chí Kinh tế đối ngoại (mẫu)', year: year0() - 1, type: 'JOURNAL', scope: 'DOMESTIC' });
  if (unitHead && r3) coPubs.push({ id: 'cb6', owner: r3, authors: [r3, unitHead], title: 'Export diversification of Vietnamese agricultural products under EVFTA: a gravity model approach', venue: 'Journal of Asian Trade (sample)', year: year0(), type: 'JOURNAL', scope: 'INTERNATIONAL' });
  if (r2 && focal) coPubs.push({ id: 'cb7', owner: r2, authors: [r2, focal], title: 'Ứng dụng phân tích dữ liệu trong logistics xanh tại cảng biển', venue: 'Kỷ yếu Hội thảo quốc tế mẫu về Thương mại và Phát triển bền vững', year: year0(), type: 'CONFERENCE', scope: 'DOMESTIC' });
  const cbCounter = t.collection('counters').doc(`CB-${year0()}`);
  let cbN = ((await cbCounter.get()).get('value') as number | undefined) ?? 0;
  for (const x of coPubs) {
    if (await exists('publications', x.id)) continue;
    cbN++;
    const u = unitOf(x.owner.unitId);
    await t.collection('publications').doc(x.id).set({
      tenantId, code: `CB-${year0()}-${String(cbN).padStart(4, '0')}`, title: x.title, titleNormalized: normalizeTitle(x.title), type: x.type, venue: x.venue, year: x.year,
      doi: null, doiNormalized: null, url: null, indexing: [], journalScope: x.scope, quartile: null, quartileSource: null,
      authors: x.authors.map((a, i) => ({ name: a.name, uid: a.uid, isInternal: true, order: i + 1 })), authorUids: x.authors.map((a) => a.uid),
      ownerUid: x.owner.uid, ownerName: x.owner.name, ...u, projectId: null, status: 'CONFIRMED', workflowKey: 'publication', workflowVersion: PUBLICATION_WORKFLOW.version,
      actorsByAction: { verify: officer.uid }, returnTo: null, createdAt: iso(-40), createdBy: x.owner.uid, updatedAt: iso(-20), updatedBy: officer.uid, version: 4, seed: true,
    });
  }
  await cbCounter.set({ value: cbN }, { merge: true });

  // 5) Danh mục KH&CN
  type Item = { id: string; kind: RegistryKind; owner: NonNullable<typeof pi>; status: 'CONFIRMED' | 'SUBMITTED'; data: Record<string, unknown> };
  const ref = (p: { uid: string; name: string } | null) => (p ? { uid: p.uid, name: p.name } : null);
  const items: Item[] = [
    { id: 'reg-nnc1', kind: 'research_group', owner: pi, status: 'CONFIRMED', data: { name: 'Nhóm nghiên cứu Chuỗi giá trị toàn cầu và Thương mại', leader: ref(pi), members: [ref(unitHead), ref(r3), ref(focal)].filter(Boolean), field: 'SOCIAL', direction: 'Chuỗi giá trị toàn cầu, FTA thế hệ mới, logistics xanh.', isStrong: true, decisionNo: 'QĐ-mẫu/NNC-01', establishedDate: date(-700) } },
    { id: 'reg-nnc2', kind: 'research_group', owner: r2 ?? pi, status: 'CONFIRMED', data: { name: 'Nhóm Phân tích dữ liệu kinh doanh', leader: ref(r2), members: [], field: 'SOCIAL', direction: 'Phân tích dữ liệu khách hàng, thương mại điện tử.', isStrong: false, establishedDate: date(-300) } },
    { id: 'reg-shtt1', kind: 'ip_asset', owner: r2 ?? pi, status: 'CONFIRMED', data: { title: 'Phần mềm phân tích phân khúc khách hàng bán lẻ (bản mẫu)', ipType: 'COPYRIGHT', inventors: [ref(r2)].filter(Boolean), ipStatus: 'GRANTED', applicationNo: 'mẫu-2025-001', filingDate: date(-400), grantNo: 'mẫu-QTG-123', grantDate: date(-200), authority: 'Cục Bản quyền tác giả', owner: 'Trường' } },
    { id: 'reg-shtt2', kind: 'ip_asset', owner: pi, status: 'SUBMITTED', data: { title: 'Giải pháp tối ưu lịch cập cảng giảm phát thải (bản mẫu)', ipType: 'UTILITY', inventors: [ref(pi), ref(focal)].filter(Boolean), ipStatus: 'FILED', applicationNo: 'mẫu-2026-017', filingDate: date(-30), authority: 'Cục Sở hữu trí tuệ' } },
    { id: 'reg-cg1', kind: 'tech_transfer', owner: r2 ?? pi, status: 'CONFIRMED', data: { title: 'Tư vấn triển khai phân tích dữ liệu khách hàng cho chuỗi bán lẻ (mẫu)', transferType: 'CONSULTING', partner: 'Công ty bán lẻ mẫu', contractNo: 'mẫu-HĐ-45', signedDate: date(-150), valueVnd: 85_000_000, staff: [ref(r2)].filter(Boolean) } },
    { id: 'reg-ht1', kind: 'conference', owner: unitHead ?? pi, status: 'CONFIRMED', data: { name: 'Hội thảo quốc tế mẫu về Thương mại và Phát triển bền vững', confLevel: 'INTERNATIONAL', startDate: date(-120), location: 'Hà Nội', organizers: [ref(unitHead), ref(pi)].filter(Boolean), papers: 64, participants: 210, proceedingsIsbn: '978-604-000-111-1', budgetVnd: 250_000_000 } },
    { id: 'reg-gt1', kind: 'award', owner: pi, status: 'CONFIRMED', data: { title: 'Giải thưởng nghiên cứu khoa học xuất sắc cấp Bộ (mẫu)', awardLevel: 'MINISTRY', rank: 'Giải Ba', organization: 'Bộ Giáo dục và Đào tạo', year: new Date().getFullYear() - 1, recipients: [ref(pi)], work: 'Chuỗi giá trị toàn cầu của doanh nghiệp xuất khẩu' } },
  ];
  const year = new Date().getFullYear();
  const counters: Record<string, number> = {};
  const prefix: Record<RegistryKind, string> = { research_group: 'NNC', ip_asset: 'SHTT', tech_transfer: 'CGCN', conference: 'HT', award: 'GT' };
  for (const it of items) {
    if (await exists('registryItems', it.id)) continue;
    const p = prefix[it.kind];
    counters[p] = (counters[p] ?? 0) + 1;
    const def = REGISTRY[it.kind];
    const u = unitOf(it.owner.unitId);
    await t.collection('registryItems').doc(it.id).set({
      tenantId, kind: it.kind, code: `${p}-${year}-${String(counters[p]).padStart(4, '0')}`, title: String(it.data[def.titleField]), data: it.data, personUids: registryPersonUids(def, it.data),
      ownerUid: it.owner.uid, ownerName: it.owner.name, ...u, status: it.status, reviewNote: null,
      confirmedBy: it.status === 'CONFIRMED' ? officer.uid : null, confirmedByName: it.status === 'CONFIRMED' ? officer.name : null, confirmedAt: it.status === 'CONFIRMED' ? iso(-5) : null,
      createdAt: iso(-10), updatedAt: iso(-5), version: 2, seed: true,
    });
  }
  for (const [p, n] of Object.entries(counters)) await t.collection('counters').doc(`${p}-${year}`).set({ value: n }, { merge: true });

  // 6) Chuyên môn của sinh viên mẫu (phục vụ tìm chuyên gia / bản đồ năng lực)
  if (r3) await t.collection('researcherProfiles').doc(r3.uid).set({ orcid: '' }, { merge: true });

  await marker.set({ at: now });
  return true;
}
