/**
 * Nạp dữ liệu giả lập — XÓA dữ liệu cũ trước khi nạp. Chỉ chạy ở nơi an toàn:
 *  - bản Online: Firebase Emulator (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST), project demo-*;
 *  - bản Local (PostgreSQL + đăng nhập nội bộ): CSDL tên kết thúc _test / _dev (kiểm tra trong reset()).
 *
 *   pnpm emulators:fresh   (terminal 1)
 *   pnpm seed              (terminal 2)
 */
import { PROJECT_WORKFLOW, PROPOSAL_WORKFLOW, PUBLICATION_WORKFLOW, normalizeDoi, normalizeTitle } from '@aisrm/shared';
import { config, db, identity } from '../src/infra';
import { CALL_FORM, DEMO_PASSWORD, STUDENT_CALL_FORM, TENANTS, type SeedTenant } from './seed-data';
import { seedExtended } from './seed-extended';

export type SeedResult = Record<string, Record<string, { uid: string; email: string }>>;

const fullyLocal = () => config.dataBackend === 'postgres' && config.identityBackend === 'local';

function assertEmulator() {
  if (fullyLocal()) return; // reset() của PostgreSQL từ chối CSDL không phải _test / _dev
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Từ chối seed: chưa đặt FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (chỉ seed vào emulator).');
  }
  if (!config.projectId.startsWith('demo-')) {
    throw new Error(`Từ chối seed: projectId "${config.projectId}" không phải project demo-*.`);
  }
}

async function clearEmulators() {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const store = db();
  if (store.kind === 'postgres') await store.reset!();
  else await fetch(`http://${fsHost}/emulator/v1/projects/${config.projectId}/databases/(default)/documents`, { method: 'DELETE' });
  // Đăng nhập nội bộ lưu tài khoản trong DataStore (đã xóa ở trên); chỉ Firebase Auth cần xóa riêng.
  if (config.identityBackend !== 'local') await fetch(`http://${authHost}/emulator/v1/projects/${config.projectId}/accounts`, { method: 'DELETE' });
}

const day = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);

export async function seedTenant(t: SeedTenant, passwordFor: (email: string) => string = () => DEMO_PASSWORD): Promise<Record<string, { uid: string; email: string }>> {
  const store = db();
  const tdoc = store.collection('tenants').doc(t.id);
  const now = iso(0);
  await tdoc.set({ name: t.name, createdAt: now, seed: true });

  const byId = new Map(t.units.map((u) => [u.id, u]));
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    let cur = byId.get(id)?.parentId ?? null;
    while (cur) {
      out.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return out;
  };
  const batch = store.batch();
  for (const u of t.units) {
    batch.set(tdoc.collection('units').doc(u.id), { code: u.code, name: u.name, type: u.type, parentId: u.parentId, ancestorIds: ancestors(u.id), seed: true });
  }
  await batch.commit();

  const users: Record<string, { uid: string; email: string }> = {};
  for (const u of t.users) {
    const uid = await identity().upsertUser({ email: u.email, password: passwordFor(u.email), displayName: u.displayName });
    const rec = { uid };
    users[u.key] = { uid, email: u.email };
    const b = store.batch();
    b.set(store.collection('userTenants').doc(rec.uid), { tenantIds: [t.id] });
    b.set(tdoc.collection('people').doc(rec.uid), {
      displayName: u.displayName,
      email: u.email,
      title: u.title,
      unitId: u.unitId,
      status: 'ACTIVE',
      externalIds: { uniData360: `MOCK-${t.id}-${u.key}` },
      seed: true,
    });
    for (const r of u.roles) {
      b.set(tdoc.collection('roleBindings').doc(), {
        uid: rec.uid,
        role: r.role,
        scopeType: r.scope === 'tenant' ? 'tenant' : 'unit',
        scopeId: r.scope === 'tenant' ? null : r.scope,
        validFrom: null,
        validUntil: null,
        delegatedBy: null,
        createdAt: now,
      });
    }
    await b.commit();
  }
  return users;
}

/** Hồ sơ nghiệp vụ mẫu để có dữ liệu trên dashboard và trang làm việc. */
export async function seedBusiness(tenantId: string, users: Record<string, { uid: string }>) {
  const store = db();
  const t = store.collection('tenants').doc(tenantId);
  const tenant = TENANTS.find((x) => x.id === tenantId)!;
  const person = (key: string) => tenant.users.find((u) => u.key === key)!;
  const unitInfo = (unitId: string) => {
    const units = new Map(tenant.units.map((u) => [u.id, u]));
    const path = [unitId];
    let cur = units.get(unitId)?.parentId ?? null;
    while (cur) {
      path.push(cur);
      cur = units.get(cur)?.parentId ?? null;
    }
    return { unitId, unitPath: path, unitName: units.get(unitId)!.name };
  };
  const year = new Date().getFullYear();
  const officer = users.officer.uid;
  const now = iso(0);
  const meta = (by: string, version = 1) => ({ tenantId, createdAt: now, createdBy: by, updatedAt: now, updatedBy: by, version, seed: true });

  const calls = [
    { id: 'call-truong', code: `DOT-${year}-0001`, title: `Đợt đăng ký đề tài KH&CN cấp trường năm ${year + 1}`, level: 'UNIVERSITY', openAt: iso(-10), closeAt: iso(60), expertReview: false, form: CALL_FORM, status: 'OPEN', description: 'Đăng ký đề tài cấp trường; kinh phí tối đa 150 triệu đồng; thời gian 12–18 tháng.', eligibility: 'Giảng viên cơ hữu; không đang chủ nhiệm quá 2 đề tài cấp trường.' },
    { id: 'call-sv', code: `DOT-${year}-0002`, title: `Đợt đăng ký đề tài sinh viên NCKH năm học ${year}–${year + 1}`, level: 'STUDENT', openAt: iso(-5), closeAt: iso(45), expertReview: true, form: STUDENT_CALL_FORM, status: 'OPEN', description: 'Đề tài nghiên cứu khoa học sinh viên, có giảng viên hướng dẫn.', eligibility: 'Sinh viên chính quy năm 2 trở lên.' },
    { id: 'call-cu', code: `DOT-${year}-0003`, title: `Đợt đăng ký đề tài cấp trường năm ${year} (đã đóng)`, level: 'UNIVERSITY', openAt: iso(-300), closeAt: iso(-240), expertReview: false, form: CALL_FORM, status: 'CLOSED', description: 'Đợt đã kết thúc.', eligibility: '' },
  ];
  for (const c of calls) {
    const { id, ...rest } = c;
    await t.collection('calls').doc(id).set({ ...rest, year: year + 1, ...meta(officer) });
  }
  await t.collection('counters').doc(`DOT-${year}`).set({ value: 3 });

  const fullFields = {
    field: 'Kinh tế',
    urgency: 'Chuỗi cung ứng toàn cầu đang dịch chuyển, đặt ra yêu cầu đánh giá tác động đến doanh nghiệp xuất khẩu Việt Nam.',
    objective: 'Đánh giá mức độ tham gia chuỗi giá trị toàn cầu của doanh nghiệp xuất khẩu và đề xuất giải pháp.',
    methods: 'Khảo sát 300 doanh nghiệp; mô hình hồi quy dữ liệu bảng; phỏng vấn sâu 20 chuyên gia.',
    expectedOutputs: '01 bài báo tạp chí trong nước; 01 bài hội thảo quốc tế; 01 báo cáo chính sách.',
    applicationValue: 'Tài liệu tham khảo cho cơ quan quản lý và giảng dạy học phần Kinh tế quốc tế.',
  };
  const proposals = [
    { id: 'dx1', code: `DX-${year}-0001`, owner: 'researcher2', title: 'Ứng dụng phân tích dữ liệu khách hàng trong doanh nghiệp bán lẻ vừa và nhỏ', status: 'UNIT_REVIEW', budget: 90_000_000, months: 12 },
    { id: 'dx2', code: `DX-${year}-0002`, owner: 'researcher3', title: 'Tác động của hiệp định EVFTA đến xuất khẩu nông sản khu vực phía Nam', status: 'SCIENCE_REVIEW', budget: 120_000_000, months: 18 },
    { id: 'dx3', code: `DX-${year}-0003`, owner: 'pi', title: 'Chuyển đổi xanh trong logistics cảng biển Việt Nam', status: 'DRAFT', budget: null, months: null },
    { id: 'dx4', code: `DX-${year}-0004`, owner: 'focal2', title: 'Văn hóa doanh nghiệp và gắn kết nhân viên thế hệ Z', status: 'APPROVAL_PENDING', budget: 80_000_000, months: 12 },
    { id: 'dx5', code: `DX-${year}-0005`, owner: 'pi', title: 'Mức độ tham gia chuỗi giá trị toàn cầu của doanh nghiệp xuất khẩu Việt Nam', status: 'APPROVED', budget: 140_000_000, months: 12 },
    { id: 'dx6', code: `DX-${year}-0006`, owner: 'researcher3', title: 'Phát triển du lịch cộng đồng gắn với kinh tế số', status: 'APPROVED', budget: 100_000_000, months: 12 },
  ];
  for (const p of proposals) {
    const u = person(p.owner);
    const ui = unitInfo(u.unitId);
    const submitted = p.status !== 'DRAFT';
    await t.collection('proposals').doc(p.id).set({
      code: p.code,
      callId: p.id === 'dx5' || p.id === 'dx6' ? 'call-cu' : 'call-truong',
      callCode: p.id === 'dx5' || p.id === 'dx6' ? calls[2].code : calls[0].code,
      callTitle: p.id === 'dx5' || p.id === 'dx6' ? calls[2].title : calls[0].title,
      formVersion: 1,
      workflowKey: 'proposal',
      workflowVersion: PROPOSAL_WORKFLOW.version,
      title: p.title,
      ownerUid: users[p.owner].uid,
      ownerName: u.displayName,
      ...ui,
      members: [{ uid: users[p.owner].uid, name: u.displayName, role: 'PI', unitName: ui.unitName }],
      memberUids: [users[p.owner].uid],
      fields: submitted ? fullFields : { field: 'Kinh tế', objective: 'Đánh giá thực trạng và đề xuất lộ trình chuyển đổi xanh.' },
      budgetVnd: p.budget,
      durationMonths: p.months,
      status: p.status,
      returnTo: null,
      actorsByAction: p.status === 'APPROVAL_PENDING' ? { science_forward: officer } : {},
      currentRevisionNo: submitted ? 1 : 0,
      submittedAt: submitted ? iso(-20) : null,
      decidedAt: p.status === 'APPROVED' ? iso(-250) : null,
      projectId: p.id === 'dx5' ? 'dt1' : p.id === 'dx6' ? 'dt2' : null,
      expertReview: false,
      classification: 'INTERNAL',
      ...meta(users[p.owner].uid, submitted ? 2 : 1),
    });
    if (submitted) {
      await t.collection('proposals').doc(p.id).collection('revisions').doc('1').set({
        revisionNo: 1,
        submittedAt: iso(-20),
        submittedBy: users[p.owner].uid,
        snapshot: { title: p.title, members: [], fields: fullFields, budgetVnd: p.budget, durationMonths: p.months, documentIds: [] },
      });
      await t.collection('proposals').doc(p.id).collection('history').add({
        action: 'submit', actionLabel: 'Nộp hồ sơ', from: 'DRAFT', to: 'UNIT_REVIEW', actorUid: users[p.owner].uid, actorName: u.displayName, comment: '(dữ liệu mẫu)', at: iso(-20), version: 2, revisionNo: 1,
      });
    }
  }
  await t.collection('counters').doc(`DX-${year}`).set({ value: proposals.length });

  const projects = [
    { id: 'dt1', code: `DT-${year}-0001`, proposalId: 'dx5', owner: 'pi', title: proposals[4].title, budget: 140_000_000, start: date(-260), end: date(105),
      milestones: [
        { title: 'Tổng quan tài liệu và khung phân tích', due: date(-170), status: 'ACCEPTED', deliverable: 'Báo cáo tổng quan' },
        { title: 'Khảo sát doanh nghiệp', due: date(-11), status: 'OPEN', deliverable: 'Bộ dữ liệu khảo sát 300 doanh nghiệp' },
        { title: 'Bài báo tạp chí trong nước', due: date(70), status: 'OPEN', deliverable: '01 bài báo được chấp nhận đăng' },
      ] },
    { id: 'dt2', code: `DT-${year}-0002`, proposalId: 'dx6', owner: 'researcher3', title: proposals[5].title, budget: 100_000_000, start: date(-200), end: date(165),
      milestones: [
        { title: 'Khảo sát điểm du lịch cộng đồng', due: date(20), status: 'OPEN', deliverable: 'Báo cáo khảo sát' },
        { title: 'Báo cáo tổng kết', due: date(150), status: 'OPEN', deliverable: 'Báo cáo tổng kết đề tài' },
      ] },
  ];
  for (const pj of projects) {
    const u = person(pj.owner);
    const ui = unitInfo(u.unitId);
    const open = pj.milestones.filter((m) => m.status !== 'ACCEPTED').map((m) => m.due).sort();
    await t.collection('projects').doc(pj.id).set({
      code: pj.code,
      proposalId: pj.proposalId,
      title: pj.title,
      ownerUid: users[pj.owner].uid,
      ownerName: u.displayName,
      memberUids: [users[pj.owner].uid],
      members: [{ uid: users[pj.owner].uid, name: u.displayName, role: 'PI', unitName: ui.unitName }],
      ...ui,
      budgetVnd: pj.budget,
      startDate: pj.start,
      endDate: pj.end,
      status: 'ACTIVE',
      workflowKey: 'project',
      workflowVersion: PROJECT_WORKFLOW.version,
      actorsByAction: { activate: officer },
      returnTo: null,
      milestoneStats: {
        total: pj.milestones.length,
        accepted: pj.milestones.filter((m) => m.status === 'ACCEPTED').length,
        open: pj.milestones.filter((m) => m.status === 'OPEN').length,
        nextDue: open[0] ?? null,
      },
      ...meta(officer, 3),
    });
    for (const m of pj.milestones) {
      await t.collection('projects').doc(pj.id).collection('milestones').add({
        title: m.title,
        dueDate: m.due,
        deliverable: m.deliverable,
        status: m.status,
        submittedAt: m.status === 'ACCEPTED' ? iso(-175) : null,
        submittedNote: m.status === 'ACCEPTED' ? '(dữ liệu mẫu)' : null,
        documentIds: [],
        acceptedBy: m.status === 'ACCEPTED' ? officer : null,
        acceptedAt: m.status === 'ACCEPTED' ? iso(-168) : null,
        createdAt: iso(-255),
      });
    }
  }
  await t.collection('counters').doc(`DT-${year}`).set({ value: projects.length });

  const pubs = [
    { id: 'cb1', code: `CB-${year}-0001`, owner: 'pi', title: 'Global value chain participation of Vietnamese exporting firms: evidence from panel data', type: 'JOURNAL', venue: 'Tạp chí Kinh tế đối ngoại (mẫu)', doi: '10.5555/ftu.demo.2026.001', status: 'CONFIRMED', indexing: ['HĐGSNN'], acts: { verify: officer, confirm: users.head.uid } },
    { id: 'cb2', code: `CB-${year}-0002`, owner: 'researcher2', title: 'Customer analytics adoption in Vietnamese SMEs', type: 'CONFERENCE', venue: 'Hội thảo quốc tế mẫu về Kinh doanh 2026', doi: null, status: 'SUBMITTED', indexing: [], acts: {} },
    { id: 'cb3', code: `CB-${year}-0003`, owner: 'researcher3', title: 'EVFTA và xuất khẩu nông sản: phân tích mô hình trọng lực', type: 'JOURNAL', venue: 'Tạp chí Nghiên cứu kinh tế (mẫu)', doi: '10.5555/ftu.demo.2026.003', status: 'VERIFIED', indexing: ['HĐGSNN'], acts: { verify: officer } },
    { id: 'cb4', code: `CB-${year}-0004`, owner: 'pi', title: 'Logistics xanh tại cảng biển: kinh nghiệm quốc tế', type: 'BOOK_CHAPTER', venue: 'Sách chuyên khảo mẫu', doi: null, status: 'DRAFT', indexing: [], acts: {} },
  ];
  for (const pb of pubs) {
    const u = person(pb.owner);
    const ui = unitInfo(u.unitId);
    await t.collection('publications').doc(pb.id).set({
      code: pb.code,
      title: pb.title,
      titleNormalized: normalizeTitle(pb.title),
      type: pb.type,
      venue: pb.venue,
      year,
      doi: pb.doi,
      doiNormalized: normalizeDoi(pb.doi),
      url: null,
      indexing: pb.indexing,
      authors: [{ name: u.displayName, uid: users[pb.owner].uid, isInternal: true, order: 1 }],
      authorUids: [users[pb.owner].uid],
      ownerUid: users[pb.owner].uid,
      ownerName: u.displayName,
      ...ui,
      projectId: pb.id === 'cb1' ? 'dt1' : null,
      status: pb.status,
      workflowKey: 'publication',
      workflowVersion: PUBLICATION_WORKFLOW.version,
      actorsByAction: pb.acts,
      returnTo: null,
      ...meta(users[pb.owner].uid, 2),
    });
  }
  await t.collection('counters').doc(`CB-${year}`).set({ value: pubs.length });

  await seedAiDefaults(tenantId);
  await seedStudentResearch(tenantId);
  await seedProfiles(tenantId);
  await seedRegulations(tenantId);
  await seedExtended(tenantId);
}

/**
 * Dữ liệu mẫu NCKH sinh viên (đợt call-sv có bước thẩm định). Idempotent: bỏ qua nếu đã có.
 * Tra uid theo email trong seed-data nên dùng được cho cả emulator và staging.
 */
export async function seedStudentResearch(tenantId: string): Promise<boolean> {
  const store = db();
  const t = store.collection('tenants').doc(tenantId);
  if ((await t.collection('proposals').doc('sv1').get()).exists) return false;
  const tenant = TENANTS.find((x) => x.id === tenantId)!;
  const uidOf = async (key: string) => {
    const u = tenant.users.find((x) => x.key === key)!;
    const s = await t.collection('people').where('email', '==', u.email).limit(1).get();
    return { uid: s.docs[0].id, name: u.displayName, unitId: u.unitId };
  };
  const [student, officer] = await Promise.all([uidOf('student'), uidOf('officer')]);
  const units = new Map(tenant.units.map((u) => [u.id, u]));
  const path: string[] = [student.unitId];
  for (let cur = units.get(student.unitId)?.parentId ?? null; cur; cur = units.get(cur)?.parentId ?? null) path.push(cur);
  const unit = { unitId: student.unitId, unitPath: path, unitName: units.get(student.unitId)!.name };
  const call = (await t.collection('calls').doc('call-sv').get()).data()!;
  const year = new Date().getFullYear();
  const now = iso(0);
  const counter = t.collection('counters').doc(`DX-${year}`);
  const base = (await counter.get()).get('value') ?? 0;
  const items = [
    { id: 'sv1', title: 'Hành vi mua sắm trực tuyến của sinh viên Hà Nội sau đại dịch', status: 'UNIT_REVIEW', fields: { field: 'Kinh doanh – Quản lý', objective: 'Xác định các yếu tố ảnh hưởng đến ý định mua sắm trực tuyến của sinh viên.', supervisor: 'TS. Trần Thị Bình' } },
    { id: 'sv2', title: 'Ứng dụng mô hình học máy dự báo giá nông sản xuất khẩu', status: 'APPROVED', fields: { field: 'Kinh tế', objective: 'Xây dựng mô hình dự báo giá cà phê xuất khẩu theo tháng bằng học máy.', supervisor: 'ThS. Hoàng Thu Hà' } },
  ];
  let n = base;
  for (const it of items) {
    n++;
    await t.collection('proposals').doc(it.id).set({
      tenantId, code: `DX-${year}-${String(n).padStart(4, '0')}`, callId: 'call-sv', callCode: call.code, callTitle: call.title, formVersion: 1,
      workflowKey: 'proposal', workflowVersion: PROPOSAL_WORKFLOW.version, title: it.title, ownerUid: student.uid, ownerName: student.name, ...unit,
      members: [{ uid: student.uid, name: student.name, role: 'PI', unitName: unit.unitName }], memberUids: [student.uid], fields: it.fields,
      budgetVnd: 10_000_000, durationMonths: 6, status: it.status, returnTo: null,
      actorsByAction: it.status === 'APPROVED' ? { science_forward: officer.uid, expert_complete: officer.uid } : {},
      currentRevisionNo: 1, submittedAt: iso(-15), decidedAt: it.status === 'APPROVED' ? iso(-60) : null, projectId: it.status === 'APPROVED' ? 'dtsv1' : null,
      expertReview: true, classification: 'INTERNAL', createdAt: now, createdBy: student.uid, updatedAt: now, updatedBy: student.uid, version: 2, seed: true,
    });
    await t.collection('proposals').doc(it.id).collection('revisions').doc('1').set({ revisionNo: 1, submittedAt: iso(-15), submittedBy: student.uid, snapshot: { title: it.title, members: [], fields: it.fields, budgetVnd: 10_000_000, durationMonths: 6, documentIds: [] } });
  }
  await counter.set({ value: n }, { merge: true });
  const dtCounter = t.collection('counters').doc(`DT-${year}`);
  const dtN = ((await dtCounter.get()).get('value') ?? 0) + 1;
  await t.collection('projects').doc('dtsv1').set({
    tenantId, code: `DT-${year}-${String(dtN).padStart(4, '0')}`, proposalId: 'sv2', title: items[1].title, ownerUid: student.uid, ownerName: student.name,
    memberUids: [student.uid], members: [{ uid: student.uid, name: student.name, role: 'PI', unitName: unit.unitName }], ...unit,
    budgetVnd: 10_000_000, startDate: date(-50), endDate: date(130), status: 'ACTIVE', workflowKey: 'project', workflowVersion: PROJECT_WORKFLOW.version,
    actorsByAction: { activate: officer.uid }, returnTo: null, milestoneStats: { total: 2, accepted: 0, open: 2, nextDue: date(10) },
    createdAt: now, createdBy: officer.uid, updatedAt: now, updatedBy: officer.uid, version: 3, seed: true, studentResearch: true,
  });
  for (const m of [{ title: 'Thu thập và làm sạch dữ liệu giá', due: date(10), deliverable: 'Bộ dữ liệu 2015–2026' }, { title: 'Báo cáo tổng kết và bài dự thi', due: date(120), deliverable: 'Báo cáo, bài dự thi cấp trường' }]) {
    await t.collection('projects').doc('dtsv1').collection('milestones').add({ title: m.title, dueDate: m.due, deliverable: m.deliverable, status: 'OPEN', submittedAt: null, submittedNote: null, documentIds: [], acceptedBy: null, acceptedAt: null, createdAt: iso(-50) });
  }
  await dtCounter.set({ value: dtN }, { merge: true });
  return true;
}

/** Hồ sơ chuyên môn mẫu (để gợi ý phản biện). Idempotent: chỉ tạo khi người đó chưa có hồ sơ. */
export async function seedProfiles(tenantId: string): Promise<number> {
  const t = db().collection('tenants').doc(tenantId);
  const tenant = TENANTS.find((x) => x.id === tenantId);
  if (!tenant) return 0;
  const data: Record<string, { degree: string; expertise: string[]; researchInterests: string }> = {
    pi: { degree: 'TS', expertise: ['Kinh tế quốc tế', 'Chuỗi giá trị toàn cầu', 'Thương mại quốc tế', 'Doanh nghiệp xuất khẩu'], researchInterests: 'Chuỗi cung ứng toàn cầu, logistics, hiệp định thương mại tự do' },
    researcher2: { degree: 'ThS', expertise: ['Marketing', 'Phân tích dữ liệu khách hàng', 'Bán lẻ'], researchInterests: 'Hành vi người tiêu dùng, thương mại điện tử' },
    researcher3: { degree: 'TS', expertise: ['Hiệp định thương mại tự do', 'Xuất khẩu nông sản', 'Mô hình trọng lực'], researchInterests: 'EVFTA, CPTPP, thương mại nông sản' },
    focal: { degree: 'ThS', expertise: ['Logistics', 'Kinh tế biển', 'Chuyển đổi xanh'], researchInterests: 'Cảng biển, logistics xanh' },
    unitHead: { degree: 'PGS.TS', expertise: ['Kinh tế phát triển', 'Chính sách thương mại', 'Xuất khẩu nông sản'], researchInterests: 'Chính sách thương mại, hội nhập kinh tế quốc tế, EVFTA' },
    focal2: { degree: 'ThS', expertise: ['Quản trị nhân sự', 'Văn hóa doanh nghiệp'], researchInterests: 'Gắn kết nhân viên, thế hệ Z' },
    campusHead: { degree: 'PGS.TS', expertise: ['Kinh tế nông nghiệp', 'Xuất khẩu nông sản', 'Du lịch cộng đồng'], researchInterests: 'Phát triển nông thôn, du lịch bền vững' },
    head: { degree: 'TS', expertise: ['Quản lý khoa học', 'Kinh tế số'], researchInterests: 'Chính sách khoa học công nghệ' },
  };
  let n = 0;
  for (const [key, pr] of Object.entries(data)) {
    const u = tenant.users.find((x) => x.key === key);
    if (!u) continue;
    const s = await t.collection('people').where('email', '==', u.email).limit(1).get();
    if (s.empty) continue;
    const ref = t.collection('researcherProfiles').doc(s.docs[0].id);
    if ((await ref.get()).exists) continue;
    await ref.set({ academicTitle: '', degree: pr.degree, orcid: '', googleScholar: '', expertise: pr.expertise, researchInterests: pr.researchInterests, bio: '', updatedAt: iso(0), seed: true });
    n++;
  }
  return n;
}

/** Cấu hình AI Center + UNI-DATA360 mặc định (dùng cho seed emulator và nâng cấp staging). */
/** Quy chế KHCN mẫu (văn bản giả định) cho hỏi đáp quy chế. Bỏ qua nếu đã có văn bản cùng mã. */
export async function seedRegulations(tenantId: string): Promise<boolean> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { parseRegulationText } = await import('@aisrm/shared');
  const { saveRegulation } = await import('../src/regulation/service');
  const raw = readFileSync(join(__dirname, 'data', 'quy-che-khcn-mau.md'), 'utf8');
  const fm = Object.fromEntries(
    (/^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '').split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  );
  const exists = await db().collection('tenants').doc(tenantId).collection('regulations').where('code', '==', fm.code).limit(1).get();
  if (!exists.empty) return false;
  await saveRegulation(
    tenantId,
    { code: fm.code, title: fm.title, issuer: fm.issuer, effectiveDate: fm.effectiveDate, note: fm.note, sourceFileName: 'Quy_che_KHCN_mau_FTU.docx' },
    parseRegulationText(raw),
    { uid: 'system', name: 'Dữ liệu mẫu' },
  );
  return true;
}

export async function seedAiDefaults(tenantId: string, opts: { onlyIfMissing?: boolean } = {}) {
  const t = db().collection('tenants').doc(tenantId);
  if (opts.onlyIfMissing && (await t.collection('aiConfig').doc('settings').get()).exists) return false;
  // AI Center: cấu hình mẫu — chế độ giả lập, chưa có khóa API. Giá Claude theo bảng giá công bố của Anthropic
  // (tham khảo 03/11/2026); quản trị phải kiểm tra lại giá trước khi chạy thật. OpenAI/Gemini: quản trị tự thêm.
  const priceSource = 'Bảng giá Anthropic (tham khảo 03/11/2026) — kiểm tra lại trước khi dùng';
  const models = [
    { modelId: 'claude-opus-5-5', label: 'Claude Opus 5.5', input: 4_000_000, output: 20_000_000 },
    { modelId: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', input: 2_000_000, output: 10_000_000 },
    { modelId: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', input: 100_000, output: 500_000 },
  ];
  for (const m of models) {
    await t.collection('aiModels').doc(`anthropic__${m.modelId}`).set({
      provider: 'anthropic',
      modelId: m.modelId,
      label: m.label,
      inputPriceMicrosPerMTok: m.input,
      outputPriceMicrosPerMTok: m.output,
      priceEffectiveDate: '2026-11-03',
      priceSource,
      enabled: true,
      seed: true,
    });
  }
  await t.collection('aiConfig').doc('settings').set({
    mode: 'mock',
    usdToVnd: 26000,
    usdToVndDate: null,
    monthlyBudgetVnd: 500000,
    hardStop: true,
    killSwitch: false,
    defaultModelId: 'anthropic__claude-opus-5-5',
    maxOutputTokens: 2000,
  });
  await t.collection('integrations').doc('uniData360').set({ mode: 'mock', failureRatePct: 0 });
  return true;
}

export async function seed(options: { business?: boolean; log?: boolean } = {}): Promise<SeedResult> {
  assertEmulator();
  await clearEmulators();
  const result: SeedResult = {};
  for (const t of TENANTS) {
    result[t.id] = await seedTenant(t);
    if (options.business !== false && t.id === 'ftu') await seedBusiness(t.id, result[t.id]);
  }
  if (options.log !== false) {
    console.log('Đã seed dữ liệu giả lập vào emulator. Tài khoản (mật khẩu chung: %s):', DEMO_PASSWORD);
    for (const t of TENANTS) for (const u of t.users) console.log(`  [${t.id}] ${u.email.padEnd(28)} ${u.displayName} — ${u.roles.map((r) => r.role).join(', ')}`);
  }
  return result;
}

if (require.main === module) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message ?? e);
      process.exit(1);
    });
}
