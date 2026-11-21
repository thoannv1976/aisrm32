import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { hasAnyRole, type Principal, type Project, type Publication } from '@aisrm/shared';
import type { DocumentData } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { AppError, badRequest, forbidden, notFound } from '../common/errors';
import { firestore, nowIso, tcol } from '../common/firebase';
import { audit } from '../common/records';
import { parse } from '../common/util';
import {
  loadIntegration,
  mockEntities,
  mockMasterData,
  mockReceive,
  MockUnavailable,
  projectToHemis,
  publicationToHemis,
  type OutboundEvent,
} from '../integrations/uni-mock';

const MAX_ATTEMPTS = 5;
const ENTITY_COLLECTION: Record<string, string> = { proposal: 'proposals', project: 'projects', publication: 'publications' };

function requireAdmin(p: Principal) {
  if (!hasAnyRole(p, ['INTEGRATION_ADMIN', 'SYS_ADMIN'])) throw forbidden('Chỉ quản trị tích hợp / quản trị hệ thống được thực hiện.');
}

interface JobItem {
  key: string;
  result: string;
  message: string | null;
}

/** Chỉ xuất dữ liệu đã duyệt: đề tài (đã phê duyệt mới có), công bố đã xác nhận, đề xuất đã phê duyệt. */
function exportPolicy(entityType: string, status: string): boolean {
  if (entityType === 'project') return true;
  if (entityType === 'publication') return ['CONFIRMED', 'EXPORTED'].includes(status);
  if (entityType === 'proposal') return status === 'APPROVED';
  return false;
}

function canonical(entityType: string, d: DocumentData): Record<string, unknown> {
  const common = { code: d.code, title: d.title, status: d.status, unitId: d.unitId, unitName: d.unitName, ownerName: d.ownerName, updatedAt: d.updatedAt };
  if (entityType === 'project') return { ...common, startDate: d.startDate, endDate: d.endDate, budgetVnd: d.budgetVnd, proposalId: d.proposalId };
  if (entityType === 'publication') return { ...common, type: d.type, venue: d.venue, year: d.year, doi: d.doi, authors: (d.authors ?? []).map((a: { name: string }) => a.name) };
  return { ...common, budgetVnd: d.budgetVnd, callCode: d.callCode };
}

async function startJob(p: Principal, type: string, extra: Record<string, unknown> = {}) {
  const ref = tcol(p.tenantId, 'syncJobs').doc();
  await ref.set({ type, status: 'RUNNING', startedAt: nowIso(), startedBy: p.uid, startedByName: p.displayName, mode: 'mock', ...extra });
  return ref;
}

async function finishJob(ref: FirebaseFirestore.DocumentReference, counts: Record<string, number>, items: JobItem[], failed: number) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const status = failed === 0 ? 'SUCCESS' : failed < total ? 'PARTIAL' : 'FAILED';
  await ref.update({ status, finishedAt: nowIso(), counts, items: items.slice(0, 300), itemsTruncated: items.length > 300 });
  return { id: ref.id, status, counts, items: items.slice(0, 300) };
}

@Controller('integrations/uni-data360')
export class IntegrationsController {
  @Get('status')
  async status(@CurrentPrincipal() p: Principal) {
    requireAdmin(p);
    const settings = await loadIntegration(p.tenantId);
    const outbox = tcol(p.tenantId, 'outboxEvents');
    const statuses = ['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED'];
    const counts = await Promise.all(statuses.map((s) => outbox.where('status', '==', s).count().get()));
    const jobs = await tcol(p.tenantId, 'syncJobs').orderBy('startedAt', 'desc').limit(20).get();
    const entities = await mockEntities(p.tenantId);
    return {
      settings,
      contract: 'Hợp đồng đề xuất (AI_SRM_BUILD_SPEC §7.3) — chưa có API UNI-DATA360 thật.',
      outbox: Object.fromEntries(statuses.map((s, i) => [s, counts[i].data().count])),
      mockEntityCounts: entities.reduce<Record<string, number>>((m, e) => ((m[e.entityType] = (m[e.entityType] ?? 0) + 1), m), {}),
      jobs: jobs.docs.map((d) => {
        const { items, ...rest } = d.data();
        return { id: d.id, ...rest, itemCount: Array.isArray(items) ? items.length : 0 };
      }),
    };
  }

  @Put('settings')
  async saveSettings(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    requireAdmin(p);
    const b = parse(z.object({ mode: z.enum(['disabled', 'mock', 'live']), failureRatePct: z.number().int().min(0).max(90) }), body);
    if (b.mode === 'live') throw badRequest('Chưa có hợp đồng API UNI-DATA360 thật — chưa thể bật chế độ live.');
    await tcol(p.tenantId, 'integrations').doc('uniData360').set({ ...b, updatedAt: nowIso(), updatedBy: p.uid });
    await audit({ actor: p, action: 'integration.settings', resourceType: 'integration', resourceId: 'uniData360', requestId: rid, detail: `mode=${b.mode} fail=${b.failureRatePct}%` });
    return b;
  }

  @Get('jobs/:id')
  async job(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    requireAdmin(p);
    const s = await tcol(p.tenantId, 'syncJobs').doc(id).get();
    if (!s.exists) throw notFound();
    return { id: s.id, ...s.data() };
  }

  /** Chạy một phiên đồng bộ: outbound (gửi outbox), import_org (nhận danh mục), reconcile (đối soát). */
  @Post('sync-jobs')
  async run(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    requireAdmin(p);
    const { type } = parse(z.object({ type: z.enum(['outbound', 'import_org', 'reconcile', 'backfill']) }), body);
    const settings = await loadIntegration(p.tenantId);
    if (settings.mode === 'disabled') throw new AppError(409, 'INTEGRATION_DISABLED', 'Kết nối UNI-DATA360 đang tắt.');
    const result =
      type === 'outbound'
        ? await this.outbound(p, settings.failureRatePct)
        : type === 'import_org'
          ? await this.importOrg(p)
          : type === 'backfill'
            ? await this.backfill(p)
            : await this.reconcile(p);
    await audit({ actor: p, action: `integration.${type}`, resourceType: 'syncJob', resourceId: result.id, requestId: rid, detail: `${result.status} ${JSON.stringify(result.counts)}` });
    return result;
  }

  /** Phát lại các sự kiện lỗi của một phiên: đưa về hàng chờ rồi gửi lại (idempotent theo eventId — không tạo trùng). */
  @Post('sync-jobs/:id/replay')
  async replay(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string) {
    requireAdmin(p);
    const job = await tcol(p.tenantId, 'syncJobs').doc(id).get();
    if (!job.exists || job.get('type') !== 'outbound') throw notFound('Không tìm thấy phiên gửi dữ liệu.');
    const failedIds = ((job.get('items') as JobItem[]) ?? []).filter((i) => ['FAILED', 'DEAD'].includes(i.result)).map((i) => i.key);
    const batch = firestore().batch();
    for (const fid of failedIds) batch.update(tcol(p.tenantId, 'outboxEvents').doc(fid), { status: 'PENDING', attempts: 0, nextAttemptAt: null, lastError: null });
    if (failedIds.length) await batch.commit();
    const settings = await loadIntegration(p.tenantId);
    const result = await this.outbound(p, settings.failureRatePct, { replayOf: id, onlyIds: failedIds });
    await audit({ actor: p, action: 'integration.replay', resourceType: 'syncJob', resourceId: result.id, requestId: rid, detail: `replay ${id}: ${failedIds.length} sự kiện` });
    return result;
  }

  private async outbound(p: Principal, failureRatePct: number, opts: { replayOf?: string; onlyIds?: string[] } = {}) {
    const job = await startJob(p, 'outbound', opts.replayOf ? { replayOf: opts.replayOf } : {});
    const now = Date.now();
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (opts.onlyIds) {
      const snaps = await Promise.all(opts.onlyIds.map((i) => tcol(p.tenantId, 'outboxEvents').doc(i).get()));
      docs = snaps.filter((s) => s.exists) as FirebaseFirestore.QueryDocumentSnapshot[];
    } else {
      docs = (await tcol(p.tenantId, 'outboxEvents').where('status', 'in', ['PENDING', 'FAILED']).limit(300).get()).docs.filter(
        (d) => !d.get('nextAttemptAt') || new Date(d.get('nextAttemptAt')).getTime() <= now,
      );
    }
    docs.sort((a, b) => String(a.get('occurredAt')).localeCompare(String(b.get('occurredAt'))));
    const counts: Record<string, number> = { ACCEPTED: 0, DUPLICATE: 0, STALE_IGNORED: 0, SKIPPED: 0, FAILED: 0, DEAD: 0 };
    const items: JobItem[] = [];
    for (const d of docs) {
      const e = d.data();
      const attempts = ((e.attempts as number) ?? 0) + 1;
      const col = ENTITY_COLLECTION[e.entityType];
      const entity = col ? await tcol(p.tenantId, col).doc(e.entityId).get() : null;
      if (!entity?.exists || !exportPolicy(e.entityType, entity.get('status'))) {
        await d.ref.update({ status: 'SKIPPED', attempts, lastError: null, processedAt: nowIso(), note: 'Không thuộc phạm vi xuất (chỉ xuất dữ liệu đã duyệt)' });
        counts.SKIPPED++;
        items.push({ key: d.id, result: 'SKIPPED', message: `${e.eventType} — chưa đến trạng thái được phép xuất` });
        continue;
      }
      const event: OutboundEvent = {
        eventId: e.eventId,
        eventType: e.eventType,
        schemaVersion: e.schemaVersion ?? '1.0',
        tenantId: p.tenantId,
        sourceSystem: 'AI-SRM',
        occurredAt: e.occurredAt,
        entityType: e.entityType,
        entityId: e.entityId,
        entityVersion: e.entityVersion,
        operation: 'upsert',
        data: canonical(e.entityType, entity.data()!),
      };
      try {
        const result = await mockReceive(p.tenantId, event, failureRatePct);
        await d.ref.update({ status: 'SENT', attempts, sentAt: nowIso(), result, lastError: null, nextAttemptAt: null });
        counts[result]++;
        items.push({ key: d.id, result, message: `${e.eventType} v${e.entityVersion}` });
      } catch (err) {
        const dead = attempts >= MAX_ATTEMPTS;
        const message = err instanceof MockUnavailable ? err.message : 'Lỗi gửi dữ liệu';
        await d.ref.update({
          status: dead ? 'DEAD' : 'FAILED',
          attempts,
          lastError: message,
          nextAttemptAt: dead ? null : new Date(now + 2 ** attempts * 60_000).toISOString(),
        });
        counts[dead ? 'DEAD' : 'FAILED']++;
        items.push({ key: d.id, result: dead ? 'DEAD' : 'FAILED', message });
      }
    }
    return finishJob(job, counts, items, counts.FAILED + counts.DEAD);
  }

  /** Nhận danh mục đơn vị/cán bộ từ UNI giả lập; đối chiếu và báo khác biệt (không tự ghi đè dữ liệu). */
  private async importOrg(p: Principal) {
    const job = await startJob(p, 'import_org');
    const master = await mockMasterData(p.tenantId);
    const [units, people] = await Promise.all([tcol(p.tenantId, 'units').get(), tcol(p.tenantId, 'people').get()]);
    const unitByCode = new Map(units.docs.map((d) => [d.get('code') as string, d]));
    const personByExt = new Map(people.docs.filter((d) => d.get('externalIds')?.uniData360).map((d) => [d.get('externalIds').uniData360 as string, d]));
    const counts: Record<string, number> = { UNCHANGED: 0, CHANGED: 0, NEW_IN_UNI: 0, MISSING_IN_UNI: 0 };
    const items: JobItem[] = [];
    for (const u of master.units) {
      const local = unitByCode.get(u.code);
      if (!local) {
        counts.NEW_IN_UNI++;
        items.push({ key: `unit:${u.code}`, result: 'NEW_IN_UNI', message: `Đơn vị mới trên UNI: ${u.name}` });
      } else if (local.get('name') !== u.name) {
        counts.CHANGED++;
        items.push({ key: `unit:${u.code}`, result: 'CHANGED', message: `Tên khác: SRM "${local.get('name')}" ↔ UNI "${u.name}"` });
      } else counts.UNCHANGED++;
    }
    const uniCodes = new Set(master.units.map((u) => u.code));
    for (const [code, d] of unitByCode) {
      if (!uniCodes.has(code)) {
        counts.MISSING_IN_UNI++;
        items.push({ key: `unit:${code}`, result: 'MISSING_IN_UNI', message: `Đơn vị chỉ có trên SRM: ${d.get('name')}` });
      }
    }
    for (const person of master.people) {
      const local = personByExt.get(person.uniId);
      if (!local) {
        counts.NEW_IN_UNI++;
        items.push({ key: `person:${person.uniId}`, result: 'NEW_IN_UNI', message: `Cán bộ mới trên UNI: ${person.fullName}` });
      } else counts.UNCHANGED++;
    }
    await tcol(p.tenantId, 'integrations').doc('uniData360').set({ lastImportAt: nowIso() }, { merge: true });
    // Khác biệt là kết quả đối chiếu, không phải lỗi gửi; người có thẩm quyền xem xét trước khi áp dụng.
    return finishJob(job, counts, items, 0);
  }

  /**
   * Đồng bộ ban đầu (backfill): đưa vào outbox các bản ghi được phép chia sẻ mà UNI chưa có phiên bản hiện tại.
   * Idempotent: eventId cố định theo (loại, id, version) nên chạy lại không tạo sự kiện trùng.
   */
  private async backfill(p: Principal) {
    const job = await startJob(p, 'backfill');
    const [projects, pubs, uni] = await Promise.all([
      tcol(p.tenantId, 'projects').get(),
      tcol(p.tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).get(),
      mockEntities(p.tenantId),
    ]);
    const uniVersion = new Map(uni.map((e) => [`${e.entityType}__${e.entityId}`, e.entityVersion]));
    const counts: Record<string, number> = { QUEUED: 0, UP_TO_DATE: 0 };
    const items: JobItem[] = [];
    const batch = firestore().batch();
    const entries = [...projects.docs.map((d) => ['project', d] as const), ...pubs.docs.map((d) => ['publication', d] as const)];
    for (const [type, d] of entries) {
      const version = d.get('version') as number;
      if ((uniVersion.get(`${type}__${d.id}`) ?? -1) >= version) {
        counts.UP_TO_DATE++;
        continue;
      }
      const eventId = createHash('sha1').update(`backfill|${p.tenantId}|${type}|${d.id}|${version}`).digest('hex');
      batch.set(tcol(p.tenantId, 'outboxEvents').doc(`bf-${eventId.slice(0, 24)}`), {
        eventId,
        eventType: `research.${type}.backfill`,
        schemaVersion: '1.0',
        tenantId: p.tenantId,
        sourceSystem: 'AI-SRM',
        occurredAt: nowIso(),
        correlationId: eventId,
        operation: 'upsert',
        status: 'PENDING',
        attempts: 0,
        entityType: type,
        entityId: d.id,
        entityVersion: version,
        data: { status: d.get('status'), code: d.get('code') },
      });
      counts.QUEUED++;
      items.push({ key: `${type}__${d.id}`, result: 'QUEUED', message: `${d.get('code')} v${version} → hàng chờ gửi` });
    }
    if (counts.QUEUED) await batch.commit();
    return finishJob(job, counts, items, 0);
  }

  /** Đối soát: so ID và version của dữ liệu được phép chia sẻ giữa SRM và UNI giả lập (không chỉ so tổng số). */
  private async reconcile(p: Principal) {
    const job = await startJob(p, 'reconcile');
    const [projects, pubs, uni] = await Promise.all([
      tcol(p.tenantId, 'projects').get(),
      tcol(p.tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).get(),
      mockEntities(p.tenantId),
    ]);
    const srm = new Map<string, { version: number; code: string }>();
    projects.docs.forEach((d) => srm.set(`project__${d.id}`, { version: d.get('version'), code: d.get('code') }));
    pubs.docs.forEach((d) => srm.set(`publication__${d.id}`, { version: d.get('version'), code: d.get('code') }));
    const uniMap = new Map(uni.filter((e) => e.entityType !== 'proposal').map((e) => [`${e.entityType}__${e.entityId}`, e]));
    const counts: Record<string, number> = { MATCHED: 0, MISSING_IN_UNI: 0, VERSION_MISMATCH: 0, EXTRA_IN_UNI: 0 };
    const items: JobItem[] = [];
    for (const [k, s] of srm) {
      const u = uniMap.get(k);
      if (!u) {
        counts.MISSING_IN_UNI++;
        items.push({ key: k, result: 'MISSING_IN_UNI', message: `${s.code} chưa có trên UNI` });
      } else if (u.entityVersion !== s.version) {
        counts.VERSION_MISMATCH++;
        items.push({ key: k, result: 'VERSION_MISMATCH', message: `${s.code}: SRM v${s.version} ↔ UNI v${u.entityVersion}` });
      } else counts.MATCHED++;
    }
    for (const [k, u] of uniMap) {
      if (!srm.has(k)) {
        counts.EXTRA_IN_UNI++;
        items.push({ key: k, result: 'EXTRA_IN_UNI', message: `${String(u.data?.code ?? k)} có trên UNI nhưng không thuộc phạm vi chia sẻ hiện tại của SRM` });
      }
    }
    return finishJob(job, counts, items, 0);
  }

  /** API xuất cho UNI-DATA360 kéo dữ liệu (hợp đồng đề xuất §7.3): cursor ổn định theo (updatedAt, id). */
  @Get('exports/:entity')
  async export(@CurrentPrincipal() p: Principal, @Param('entity') entity: string, @Query('updatedSince') updatedSince?: string, @Query('cursor') cursor?: string, @Query('pageSize') pageSize?: string) {
    requireAdmin(p);
    if (!['projects', 'publications'].includes(entity)) throw notFound();
    const size = Math.min(Math.max(Number(pageSize) || 100, 1), 500);
    let q = tcol(p.tenantId, entity).orderBy('updatedAt').orderBy('__name__').limit(size + 1);
    if (updatedSince) q = q.where('updatedAt', '>=', updatedSince);
    if (cursor) {
      const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      q = q.startAfter(at, tcol(p.tenantId, entity).doc(id));
    }
    const snap = await q.get();
    const docs = snap.docs.filter((d) => entity === 'projects' || ['CONFIRMED', 'EXPORTED'].includes(d.get('status')));
    const page = snap.docs.slice(0, size);
    const last = page[page.length - 1];
    return {
      items: docs.slice(0, size).map((d) => ({ id: d.id, version: d.get('version'), ...canonical(entity === 'projects' ? 'project' : 'publication', d.data()) })),
      nextCursor: snap.docs.length > size && last ? Buffer.from(`${last.get('updatedAt')}|${last.id}`).toString('base64url') : null,
    };
  }

  /** Xem trước bản ghi theo chuẩn HEMIS (mục 12) — chỉ để rà soát độ đầy đủ dữ liệu, CHƯA gửi HEMIS. */
  @Get('hemis-preview')
  async hemisPreview(@CurrentPrincipal() p: Principal, @Query('entity') entity = 'projects') {
    requireAdmin(p);
    const tenant = await firestore().collection('tenants').doc(p.tenantId).get();
    const tenantName = tenant.get('name') ?? p.tenantId;
    if (entity === 'projects') {
      const snap = await tcol(p.tenantId, 'projects').limit(200).get();
      const records = snap.docs.map((d) => projectToHemis(p.tenantId, { id: d.id, ...d.data() } as Project & { id: string }, tenantName));
      return { entity, standard: 'HEMIS — API đồng bộ dữ liệu NCKH (mục 12.4)', records };
    }
    if (entity === 'publications') {
      const [snap, projects] = await Promise.all([
        tcol(p.tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).limit(200).get(),
        tcol(p.tenantId, 'projects').get(),
      ]);
      const codes = new Map(projects.docs.map((d) => [d.id, d.get('code') as string]));
      const records = snap.docs.map((d) => {
        const x = { id: d.id, ...d.data() } as Publication & { id: string };
        return publicationToHemis(p.tenantId, x, x.projectId ? (codes.get(x.projectId) ?? null) : null);
      });
      return { entity, standard: 'HEMIS — API đồng bộ dữ liệu NCKH (mục 12.10, 12.11)', records };
    }
    throw badRequest('entity phải là projects | publications');
  }
}
