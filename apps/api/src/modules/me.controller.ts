import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  activeRoles,
  availableActions,
  hasRoleFor,
  PROJECT_WORKFLOW,
  PROPOSAL_WORKFLOW,
  PUBLICATION_WORKFLOW,
  SCIENCE_OFFICE,
  stateLabel,
  type MeResponse,
  type Milestone,
  type Principal,
  type Project,
  type Proposal,
  type Publication,
  type WorkItem,
  type WorkflowDef,
} from '@aisrm/shared';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { notFound } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit, listVisible } from '../common/records';
import { docData, parse, todayIso } from '../common/util';

const profileSchema = z.object({
  academicTitle: z.string().max(100).default(''),
  degree: z.string().max(100).default(''),
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, 'ORCID dạng 0000-0000-0000-0000')
    .or(z.literal(''))
    .default(''),
  googleScholar: z.string().url().or(z.literal('')).default(''),
  expertise: z.array(z.string().min(1).max(100)).max(20).default([]),
  researchInterests: z.string().max(3000).default(''),
  bio: z.string().max(5000).default(''),
});

function pendingFor<T extends { id: string; code: string; title: string; status: string; ownerUid: string; unitPath: string[]; returnTo?: string | null; actorsByAction?: Record<string, string> }>(
  p: Principal,
  def: WorkflowDef,
  kind: WorkItem['kind'],
  items: T[],
  flags: (r: T) => Record<string, boolean> = () => ({}),
): WorkItem[] {
  const out: WorkItem[] = [];
  for (const r of items) {
    const acts = availableActions(def, r.status, {
      principal: p,
      ownerUid: r.ownerUid,
      unitPath: r.unitPath,
      flags: flags(r),
      returnTo: r.returnTo ?? null,
      actorsByAction: r.actorsByAction ?? {},
    }).filter((a) => a.tone === 'primary');
    if (acts.length === 0) continue;
    out.push({
      kind,
      id: r.id,
      code: r.code,
      title: r.title || '(chưa đặt tên)',
      status: r.status,
      statusLabel: def.states[r.status]?.label ?? r.status,
      actionHint: acts.map((a) => a.label).join(' / '),
      dueDate: null,
      link: `/${kind === 'proposal' ? 'proposals' : kind === 'project' ? 'projects' : 'publications'}/${r.id}`,
    });
  }
  return out;
}

@Controller()
export class MeController {
  @Get('me')
  async me(@CurrentPrincipal() p: Principal): Promise<MeResponse> {
    const [membership, tenant, unit] = await Promise.all([
      firestore().collection('userTenants').doc(p.uid).get(),
      firestore().collection('tenants').doc(p.tenantId).get(),
      p.unitId ? tcol(p.tenantId, 'units').doc(p.unitId).get() : Promise.resolve(null),
    ]);
    const tenantIds: string[] = membership.get('tenantIds') ?? [];
    const tenantDocs = await Promise.all(tenantIds.map((t) => firestore().collection('tenants').doc(t).get()));
    return {
      uid: p.uid,
      displayName: p.displayName,
      email: p.email ?? null,
      tenantId: p.tenantId,
      tenantName: tenant.get('name') ?? p.tenantId,
      tenants: tenantDocs.map((d) => ({ id: d.id, name: d.get('name') ?? d.id })),
      unitId: p.unitId ?? null,
      unitName: unit?.get('name') ?? null,
      roles: activeRoles(p),
      bindings: p.bindings,
    };
  }

  /** Trang làm việc: việc cần tôi xử lý, mốc sắp/đã quá hạn, yêu cầu thay đổi chờ quyết định. */
  @Get('me/workspace')
  async workspace(@CurrentPrincipal() p: Principal) {
    const [proposals, projects, publications] = await Promise.all([
      listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids' }),
      listVisible<Project>(p, 'projects', { memberField: 'memberUids' }),
      listVisible<Publication>(p, 'publications', { memberField: 'authorUids' }),
    ]);
    const tasks: WorkItem[] = [
      ...pendingFor(p, PROPOSAL_WORKFLOW, 'proposal', proposals, (r) => ({ expertReview: r.expertReview })),
      // Chỉ gợi ý đề nghị nghiệm thu khi mọi mốc đã nộp (điều kiện kiểm tra lại ở server khi thực hiện)
      ...pendingFor(p, PROJECT_WORKFLOW, 'project', projects).filter(
        (t) => !(t.status === 'ACTIVE' && (projects.find((x) => x.id === t.id)?.milestoneStats?.open ?? 0) > 0 && t.actionHint === 'Đề nghị nghiệm thu'),
      ),
      ...pendingFor(p, PUBLICATION_WORKFLOW, 'publication', publications),
    ];

    const today = todayIso();
    const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const deadlines: WorkItem[] = [];
    const myActive = projects.filter((x) => (x.ownerUid === p.uid || x.memberUids.includes(p.uid)) && x.status === 'ACTIVE');
    const msSnaps = await Promise.all(
      myActive.map((x) => tcol(p.tenantId, 'projects').doc(x.id).collection('milestones').where('status', '==', 'OPEN').get()),
    );
    myActive.forEach((proj, i) => {
      for (const d of msSnaps[i].docs) {
        const m = d.data() as Milestone;
        if (m.dueDate > horizon) continue;
        deadlines.push({
          kind: 'milestone',
          id: d.id,
          code: proj.code,
          title: `${m.title} — ${proj.title}`,
          status: m.dueDate < today ? 'OVERDUE' : 'DUE_SOON',
          statusLabel: m.dueDate < today ? 'Quá hạn' : 'Sắp đến hạn',
          actionHint: 'Nộp sản phẩm',
          dueDate: m.dueDate,
          link: `/projects/${proj.id}`,
        });
      }
    });
    deadlines.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

    for (const proj of projects) {
      if ((proj as Project & { pendingChangeRequests?: number }).pendingChangeRequests && hasRoleFor(p, SCIENCE_OFFICE, proj.unitPath) && proj.ownerUid !== p.uid) {
        tasks.push({
          kind: 'change_request',
          id: proj.id,
          code: proj.code,
          title: proj.title,
          status: proj.status,
          statusLabel: stateLabel('project', proj.status),
          actionHint: 'Xem xét yêu cầu thay đổi',
          dueDate: null,
          link: `/projects/${proj.id}`,
        });
      }
    }

    const unread = await tcol(p.tenantId, 'notifications').where('uid', '==', p.uid).where('read', '==', false).count().get();
    return {
      tasks,
      deadlines,
      summary: {
        myProposals: proposals.filter((x) => x.ownerUid === p.uid).length,
        myProjects: projects.filter((x) => x.ownerUid === p.uid || x.memberUids.includes(p.uid)).length,
        myPublications: publications.filter((x) => x.ownerUid === p.uid || x.authorUids.includes(p.uid)).length,
        unreadNotifications: unread.data().count,
      },
    };
  }

  @Get('me/notifications')
  async notifications(@CurrentPrincipal() p: Principal) {
    const snap = await tcol(p.tenantId, 'notifications').where('uid', '==', p.uid).limit(200).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; createdAt: string });
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { items: items.slice(0, 50) };
  }

  @Post('me/notifications/:id/read')
  async markRead(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const ref = tcol(p.tenantId, 'notifications').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.get('uid') !== p.uid) throw notFound();
    await ref.update({ read: true });
    return { id, read: true };
  }

  @Post('me/notifications/read-all')
  async markAllRead(@CurrentPrincipal() p: Principal) {
    const snap = await tcol(p.tenantId, 'notifications').where('uid', '==', p.uid).where('read', '==', false).limit(400).get();
    const batch = firestore().batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    return { updated: snap.size };
  }

  @Put('me/profile')
  async updateProfile(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    const b = parse(profileSchema, body);
    await tcol(p.tenantId, 'researcherProfiles').doc(p.uid).set({ ...b, updatedAt: nowIso(), updatedBy: p.uid }, { merge: true });
    await audit({ actor: p, action: 'profile.update', resourceType: 'researcherProfile', resourceId: p.uid, requestId: rid });
    return { uid: p.uid };
  }

  /**
   * Hồ sơ nhà khoa học: thông tin tự khai + kết quả ĐÃ XÁC NHẬN (công bố CONFIRMED/EXPORTED, đề tài đã duyệt).
   * Dữ liệu chưa xác nhận không đưa vào lý lịch.
   */
  @Get('researchers/:uid')
  async researcher(@CurrentPrincipal() p: Principal, @Param('uid') uid: string) {
    const [person, profile, pubs, owned, member] = await Promise.all([
      tcol(p.tenantId, 'people').doc(uid).get(),
      tcol(p.tenantId, 'researcherProfiles').doc(uid).get(),
      tcol(p.tenantId, 'publications').where('authorUids', 'array-contains', uid).get(),
      tcol(p.tenantId, 'projects').where('ownerUid', '==', uid).get(),
      tcol(p.tenantId, 'projects').where('memberUids', 'array-contains', uid).get(),
    ]);
    if (!person.exists) throw notFound();
    const unit = person.get('unitId') ? await tcol(p.tenantId, 'units').doc(person.get('unitId')).get() : null;
    const projMap = new Map<string, Project & { id: string }>();
    [...owned.docs, ...member.docs].forEach((d) => projMap.set(d.id, docData<Project>(d)));
    const confirmedPubs = pubs.docs
      .map((d) => docData<Publication>(d))
      .filter((x) => ['CONFIRMED', 'EXPORTED'].includes(x.status))
      .sort((a, b) => b.year - a.year);
    const projects = [...projMap.values()]
      .filter((x) => !['CANCELLED'].includes(x.status))
      .map((x) => ({ id: x.id, code: x.code, title: x.title, status: x.status, role: x.ownerUid === uid ? 'Chủ nhiệm' : 'Thành viên', startDate: x.startDate, endDate: x.endDate }));
    return {
      uid,
      displayName: person.get('displayName'),
      title: person.get('title') ?? null,
      unitName: unit?.get('name') ?? null,
      profile: profile.exists ? profile.data() : null,
      publications: confirmedPubs.map((x) => ({ id: x.id, code: x.code, title: x.title, venue: x.venue, year: x.year, doi: x.doi, type: x.type, authors: x.authors.map((a) => a.name).join('; ') })),
      projects,
      canEdit: uid === p.uid,
      note: 'Chỉ hiển thị công bố đã được phòng KH xác nhận và đề tài đã được phê duyệt.',
    };
  }
}
