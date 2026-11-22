import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { normalizeTitle, REGISTRY, SCIENCE_FIELDS, type Principal, type Project, type Publication, type RegistryItem } from '@aisrm/shared';
import { z } from 'zod';
import { researcherIntro } from '../ai/features-ext';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { audit } from '../common/records';
import { docData, parse } from '../common/util';
import { nowIso, tcol } from '../infra';
import { confirmedRegistryFor, REGISTRY_COLLECTION } from './registry.controller';

const CONFIRMED_PUB = ['CONFIRMED', 'EXPORTED'];
const ACTIVE_PROJECT = ['CONTRACT_PENDING', 'ACTIVE', 'ACCEPTANCE_PENDING', 'COMPLETION_REVISION', 'COMPLETED', 'ARCHIVED'];

interface PersonLite {
  uid: string;
  displayName: string;
  title: string | null;
  unitId: string | null;
  unitName: string | null;
}

async function loadPeople(tenantId: string) {
  const [people, units, profiles] = await Promise.all([
    tcol(tenantId, 'people').where('status', '==', 'ACTIVE').limit(5000).get(),
    tcol(tenantId, 'units').get(),
    tcol(tenantId, 'researcherProfiles').get(),
  ]);
  const unitNames = new Map(units.docs.map((d) => [d.id, d.get('name') as string]));
  const prof = new Map(profiles.docs.map((d) => [d.id, d.data()]));
  const list: (PersonLite & { expertise: string[]; interests: string; external: boolean })[] = people.docs.map((d) => ({
    uid: d.id,
    displayName: d.get('displayName'),
    title: d.get('title') ?? null,
    unitId: d.get('unitId') ?? null,
    unitName: unitNames.get(d.get('unitId')) ?? null,
    expertise: (prof.get(d.id)?.expertise as string[] | undefined) ?? [],
    interests: (prof.get(d.id)?.researchInterests as string | undefined) ?? '',
    external: !!d.get('external'),
  }));
  return { list, unitNames };
}

async function confirmedPubs(tenantId: string) {
  const snap = await tcol(tenantId, 'publications').where('status', 'in', CONFIRMED_PUB).limit(5000).get();
  return snap.docs.map((d) => docData<Publication>(d));
}

const tokenize = (s: string) => normalizeTitle(s).split(' ').filter((t) => t.length > 2);

@Controller()
export class ResearchersController {
  /**
   * Tìm chuyên gia: chấm điểm theo chuyên môn tự khai, hướng nghiên cứu, tên công bố đã xác nhận và đề tài.
   * Công thức công khai (không dùng AI): chuyên môn ×5, hướng nghiên cứu ×2, công bố ×3, đề tài ×3 cho mỗi từ khớp.
   */
  @Get('experts/search')
  async search(@CurrentPrincipal() p: Principal, @Query('q') q = '', @Query('unitId') unitId?: string) {
    const terms = [...new Set(tokenize(q))];
    const { list } = await loadPeople(p.tenantId);
    const [pubs, projects] = await Promise.all([
      confirmedPubs(p.tenantId),
      tcol(p.tenantId, 'projects').where('status', 'in', ACTIVE_PROJECT).limit(5000).get().then((s) => s.docs.map((d) => docData<Project>(d))),
    ]);
    const byPerson = new Map<string, { pubs: Publication[]; projects: Project[] }>();
    const slot = (u: string) => {
      if (!byPerson.has(u)) byPerson.set(u, { pubs: [], projects: [] });
      return byPerson.get(u)!;
    };
    for (const x of pubs) for (const u of x.authorUids ?? []) slot(u).pubs.push(x);
    for (const x of projects) for (const u of x.memberUids ?? []) slot(u).projects.push(x);
    const results = list
      .filter((x) => !unitId || x.unitId === unitId)
      .map((x) => {
        const s = byPerson.get(x.uid) ?? { pubs: [], projects: [] };
        let score = 0;
        const evidence: string[] = [];
        if (terms.length === 0) score = s.pubs.length + s.projects.length + x.expertise.length;
        for (const t of terms) {
          const exp = x.expertise.filter((e) => normalizeTitle(e).includes(t));
          if (exp.length) {
            score += 5 * exp.length;
            evidence.push(`Chuyên môn: ${exp.join(', ')}`);
          }
          if (normalizeTitle(x.interests).includes(t)) {
            score += 2;
            evidence.push('Hướng nghiên cứu có từ khóa');
          }
          const pm = s.pubs.filter((pp) => normalizeTitle(pp.title).includes(t));
          if (pm.length) {
            score += 3 * pm.length;
            evidence.push(...pm.slice(0, 2).map((pp) => `Công bố: ${pp.title} (${pp.year})`));
          }
          const jm = s.projects.filter((pp) => normalizeTitle(pp.title).includes(t));
          if (jm.length) {
            score += 3 * jm.length;
            evidence.push(...jm.slice(0, 2).map((pp) => `Đề tài: ${pp.code} — ${pp.title}`));
          }
        }
        return { uid: x.uid, displayName: x.displayName, title: x.title, unitName: x.unitName, expertise: x.expertise, external: x.external, publications: s.pubs.length, projects: s.projects.length, score, evidence: [...new Set(evidence)].slice(0, 5) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName, 'vi'))
      .slice(0, 50);
    return { items: results, formula: 'Điểm = 5×(chuyên môn khớp) + 2×(hướng nghiên cứu khớp) + 3×(công bố đã xác nhận khớp) + 3×(đề tài khớp), cộng theo từng từ khóa.' };
  }

  /** Mạng lưới đồng tác giả trong trường (từ công bố đã xác nhận). */
  @Get('experts/network')
  async network(@CurrentPrincipal() p: Principal, @Query('unitId') unitId?: string) {
    const { list } = await loadPeople(p.tenantId);
    const people = new Map(list.map((x) => [x.uid, x]));
    const pubs = await confirmedPubs(p.tenantId);
    const edges = new Map<string, { a: string; b: string; weight: number; titles: string[] }>();
    const degree = new Map<string, number>();
    for (const x of pubs) {
      const uids = [...new Set((x.authorUids ?? []).filter((u) => people.has(u)))].sort();
      for (const u of uids) degree.set(u, (degree.get(u) ?? 0) + 1);
      for (let i = 0; i < uids.length; i++)
        for (let j = i + 1; j < uids.length; j++) {
          const k = `${uids[i]}|${uids[j]}`;
          if (!edges.has(k)) edges.set(k, { a: uids[i], b: uids[j], weight: 0, titles: [] });
          const e = edges.get(k)!;
          e.weight++;
          if (e.titles.length < 3) e.titles.push(x.title);
        }
    }
    let nodes = [...degree.keys()].map((u) => ({ uid: u, name: people.get(u)!.displayName, unitName: people.get(u)!.unitName, unitId: people.get(u)!.unitId, publications: degree.get(u) ?? 0 }));
    if (unitId) {
      const keep = new Set(nodes.filter((n) => n.unitId === unitId).map((n) => n.uid));
      for (const e of edges.values()) if (keep.has(e.a) || keep.has(e.b)) keep.add(e.a), keep.add(e.b);
      nodes = nodes.filter((n) => keep.has(n.uid));
    }
    const ids = new Set(nodes.map((n) => n.uid));
    const links = [...edges.values()].filter((e) => ids.has(e.a) && ids.has(e.b));
    const crossUnit = links.filter((e) => people.get(e.a)!.unitId !== people.get(e.b)!.unitId).length;
    return { nodes, links, stats: { people: nodes.length, collaborations: links.length, crossUnit }, note: 'Chỉ tính công bố đã được Phòng KH xác nhận và tác giả trong trường.' };
  }

  /** Bản đồ năng lực: theo đơn vị — số người, chuyên môn phổ biến, công bố, đề tài, lĩnh vực đề tài (HEMIS). */
  @Get('experts/competency')
  async competency(@CurrentPrincipal() p: Principal) {
    const { list } = await loadPeople(p.tenantId);
    const pubs = await confirmedPubs(p.tenantId);
    const projects = (await tcol(p.tenantId, 'projects').where('status', 'in', ACTIVE_PROJECT).limit(5000).get()).docs.map((d) => docData<Project>(d));
    const groups = (await tcol(p.tenantId, REGISTRY_COLLECTION).where('kind', '==', 'research_group').where('status', '==', 'CONFIRMED').get()).docs.map((d) => docData<RegistryItem>(d));
    const units = new Map<string, { unitName: string; researchers: number; publications: number; projects: number; groups: number; strongGroups: number; expertise: Map<string, number>; fields: Map<string, number> }>();
    const row = (name: string | null) => {
      const k = name ?? '(chưa gắn đơn vị)';
      if (!units.has(k)) units.set(k, { unitName: k, researchers: 0, publications: 0, projects: 0, groups: 0, strongGroups: 0, expertise: new Map(), fields: new Map() });
      return units.get(k)!;
    };
    for (const x of list) {
      if (x.external) continue;
      const r = row(x.unitName);
      if (x.expertise.length || pubs.some((pp) => pp.authorUids?.includes(x.uid))) r.researchers++;
      for (const e of x.expertise) r.expertise.set(e, (r.expertise.get(e) ?? 0) + 1);
    }
    for (const x of pubs) row(x.unitName).publications++;
    for (const x of projects) {
      const r = row(x.unitName);
      r.projects++;
      const f = x.hemis?.field;
      if (f) r.fields.set(SCIENCE_FIELDS[f], (r.fields.get(SCIENCE_FIELDS[f]) ?? 0) + 1);
    }
    for (const g of groups) {
      const r = row(g.unitName);
      r.groups++;
      if (g.data.isStrong) r.strongGroups++;
    }
    const top = (m: Map<string, number>, n = 6) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
    const expertiseAll = new Map<string, number>();
    for (const x of list) for (const e of x.expertise) expertiseAll.set(e, (expertiseAll.get(e) ?? 0) + 1);
    return {
      units: [...units.values()].map((u) => ({ unitName: u.unitName, researchers: u.researchers, publications: u.publications, projects: u.projects, groups: u.groups, strongGroups: u.strongGroups, topExpertise: top(u.expertise), fields: top(u.fields) })).sort((a, b) => b.publications + b.projects - (a.publications + a.projects)),
      topExpertise: top(expertiseAll, 20),
    };
  }

  /** AI dự thảo giới thiệu song ngữ — chỉ từ dữ liệu đã xác nhận + tự khai. Người dùng sửa và duyệt trước khi công khai. */
  @Post('me/profile/intro-draft')
  async introDraft(@CurrentPrincipal() p: Principal, @RequestId() rid: string) {
    const [person, profile, pubs, projects, reg] = await Promise.all([
      tcol(p.tenantId, 'people').doc(p.uid).get(),
      tcol(p.tenantId, 'researcherProfiles').doc(p.uid).get(),
      tcol(p.tenantId, 'publications').where('authorUids', 'array-contains', p.uid).get(),
      tcol(p.tenantId, 'projects').where('memberUids', 'array-contains', p.uid).get(),
      confirmedRegistryFor(p.tenantId, p.uid),
    ]);
    const unit = person.get('unitId') ? await tcol(p.tenantId, 'units').doc(person.get('unitId')).get() : null;
    const pr = profile.data() ?? {};
    const draft = await researcherIntro(p, {
      name: p.displayName,
      title: person.get('title') ?? null,
      unitName: unit?.get('name') ?? null,
      academicTitle: pr.academicTitle ?? '',
      degree: pr.degree ?? '',
      expertise: pr.expertise ?? [],
      researchInterests: pr.researchInterests ?? '',
      projects: projects.docs.map((d) => docData<Project>(d)).filter((x) => ACTIVE_PROJECT.includes(x.status)).map((x) => ({ title: x.title, role: x.ownerUid === p.uid ? 'Chủ nhiệm' : 'Thành viên' })),
      publications: pubs.docs.map((d) => docData<Publication>(d)).filter((x) => CONFIRMED_PUB.includes(x.status)).sort((a, b) => b.year - a.year).slice(0, 10).map((x) => ({ title: x.title, venue: x.venue, year: x.year })),
      awards: reg.filter((x) => x.kind === 'award').map((x) => `${x.title} (${x.data.year ?? ''})`),
    });
    await audit({ actor: p, action: 'ai.researcher_intro', resourceType: 'researcherProfile', resourceId: p.uid, requestId: rid, detail: `${draft.model.provider}/${draft.model.modelId}${draft.mock ? ' (mock)' : ''}` });
    return draft;
  }

  /** Lưu giới thiệu song ngữ sau khi người dùng duyệt (công khai trên hồ sơ). */
  @Put('me/profile/intro')
  async saveIntro(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = parse(z.object({ introVi: z.string().max(4000), introEn: z.string().max(4000), approved: z.literal(true) }), body);
    await tcol(p.tenantId, 'researcherProfiles').doc(p.uid).set({ introVi: b.introVi.trim(), introEn: b.introEn.trim(), introApprovedAt: nowIso(), updatedAt: nowIso(), updatedBy: p.uid }, { merge: true });
    await audit({ actor: p, action: 'profile.intro', resourceType: 'researcherProfile', resourceId: p.uid, requestId: rid });
    return { ok: true };
  }
}

/** Phần mở rộng hồ sơ khoa học: danh mục đã xác nhận và đồng tác giả. */
export async function researcherExtras(tenantId: string, uid: string, pubs: Publication[]) {
  const reg = await confirmedRegistryFor(tenantId, uid);
  const people = new Map((await tcol(tenantId, 'people').get()).docs.map((d) => [d.id, d.get('displayName') as string]));
  const co = new Map<string, number>();
  for (const x of pubs) for (const u of x.authorUids ?? []) if (u !== uid) co.set(u, (co.get(u) ?? 0) + 1);
  return {
    registry: reg.map((x) => ({ id: x.id, kind: x.kind, kindLabel: REGISTRY[x.kind].label, code: x.code, title: x.title, data: x.data })),
    coauthors: [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([u, n]) => ({ uid: u, name: people.get(u) ?? u, count: n })),
  };
}
