/**
 * Bộ hẹn giờ tác vụ nền (L4 — ADR-0003). Chạy trong tiến trình API, khóa "thuê" (lease) lưu trong DataStore
 * để khi chạy nhiều bản API cùng lúc chỉ một bản thực hiện mỗi lượt.
 * - Bản Local: bật mặc định (SCHEDULER_ENABLED=true).
 * - Bản Online (Cloud Run có thể tắt khi rảnh): mặc định tắt; quản trị bấm "Chạy ngay" hoặc dùng Cloud Scheduler gọi API.
 */
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { config, db } from '../infra';

export interface JobResult {
  summary: string;
  counts?: Record<string, number>;
}

export interface JobDef {
  name: string;
  label: string;
  /** Giờ chạy hằng ngày theo múi giờ của trường (0–23). */
  dailyAtHour: number;
  run(now: Date): Promise<JobResult>;
}

export interface JobStatus {
  name: string;
  label: string;
  dailyAtHour: number;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastSummary: string | null;
  nextRunAt: string | null;
  running: boolean;
}

const LEASE_MS = 10 * 60_000;
const owner = randomUUID();
const jobs = new Map<string, JobDef>();
const log = new Logger('Scheduler');
let timer: NodeJS.Timeout | null = null;

const jobRef = (name: string) => db().collection('_jobs').doc(name);

/** Ngày giờ "địa phương" theo múi giờ cấu hình → độ lệch so với UTC (phút). */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Ngày hôm nay (YYYY-MM-DD) theo múi giờ của trường. */
export function localDate(at: Date, timeZone = config.timezone, addDays = 0): string {
  const shifted = new Date(at.getTime() + tzOffsetMinutes(at, timeZone) * 60_000 + addDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Lần chạy kế tiếp: hour:00 theo giờ địa phương, sau thời điểm `after`. */
export function nextDailyRun(after: Date, hour: number, timeZone = config.timezone): Date {
  const off = tzOffsetMinutes(after, timeZone);
  for (let d = 0; d <= 2; d++) {
    const [y, m, day] = localDate(after, timeZone, d).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, day, hour, 0) - off * 60_000);
    if (t > after) return t;
  }
  return new Date(after.getTime() + 86_400_000);
}

export function registerJob(job: JobDef) {
  jobs.set(job.name, job);
}

export function listJobs(): JobDef[] {
  return [...jobs.values()];
}

async function acquire(name: string, now: Date, force: boolean): Promise<boolean> {
  return db().runTransaction(async (tx) => {
    const s = await tx.get(jobRef(name));
    const lease = s.exists ? (s.get('leaseUntil') as string | null) : null;
    const next = s.exists ? (s.get('nextRunAt') as string | null) : null;
    if (lease && Date.parse(lease) > now.getTime()) return false;
    if (!force && next && Date.parse(next) > now.getTime()) return false;
    tx.set(jobRef(name), { leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(), leaseOwner: owner }, { merge: true });
    return true;
  });
}

/** Chạy một tác vụ (nếu không bản nào đang chạy). force=true: bỏ qua giờ hẹn (quản trị bấm "Chạy ngay"). */
export async function runJob(name: string, opts: { force?: boolean; now?: Date } = {}): Promise<{ ran: boolean; ok?: boolean; result?: JobResult; error?: string }> {
  const job = jobs.get(name);
  if (!job) throw new Error(`Không có tác vụ ${name}`);
  const now = opts.now ?? new Date();
  if (!(await acquire(name, now, !!opts.force))) return { ran: false };
  let ok = true;
  let result: JobResult | undefined;
  let error: string | undefined;
  try {
    result = await job.run(now);
  } catch (e) {
    ok = false;
    error = (e as Error).message.slice(0, 500);
    log.error(`Tác vụ ${name} lỗi: ${error}`);
  }
  await jobRef(name).set(
    {
      leaseUntil: null,
      leaseOwner: null,
      lastRunAt: now.toISOString(),
      lastOk: ok,
      lastSummary: ok ? result!.summary : `Lỗi: ${error}`,
      lastCounts: result?.counts ?? null,
      nextRunAt: nextDailyRun(now, job.dailyAtHour).toISOString(),
    },
    { merge: true },
  );
  return { ran: true, ok, result, error };
}

export async function jobStatuses(): Promise<JobStatus[]> {
  const now = Date.now();
  return Promise.all(
    listJobs().map(async (j) => {
      const s = await jobRef(j.name).get();
      const lease = s.exists ? (s.get('leaseUntil') as string | null) : null;
      return {
        name: j.name,
        label: j.label,
        dailyAtHour: j.dailyAtHour,
        lastRunAt: s.exists ? (s.get('lastRunAt') ?? null) : null,
        lastOk: s.exists ? (s.get('lastOk') ?? null) : null,
        lastSummary: s.exists ? (s.get('lastSummary') ?? null) : null,
        nextRunAt: s.exists ? (s.get('nextRunAt') ?? null) : null,
        running: !!lease && Date.parse(lease) > now,
      };
    }),
  );
}

/** Kiểm tra mỗi phút; tác vụ đến giờ thì chạy. Lần đầu (chưa có nextRunAt) đặt lịch cho giờ hẹn kế tiếp, không chạy ngay. */
export function startScheduler(tickMs = 60_000) {
  if (timer) return;
  const tick = async () => {
    for (const j of listJobs()) {
      try {
        const s = await jobRef(j.name).get();
        if (!s.exists || !s.get('nextRunAt')) {
          await jobRef(j.name).set({ nextRunAt: nextDailyRun(new Date(), j.dailyAtHour).toISOString() }, { merge: true });
          continue;
        }
        const r = await runJob(j.name);
        if (r.ran) log.log(`Tác vụ ${j.name}: ${r.ok ? r.result!.summary : r.error}`);
      } catch (e) {
        log.warn(`Không kiểm tra được tác vụ ${j.name}: ${(e as Error).message}`);
      }
    }
  };
  timer = setInterval(() => void tick(), tickMs);
  timer.unref();
  void tick();
  log.log(`Bộ hẹn giờ đã bật (${listJobs().map((j) => `${j.name}@${j.dailyAtHour}h`).join(', ')}, múi giờ ${config.timezone}).`);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
