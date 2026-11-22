import { normalizeTitle } from '@aisrm/shared';
import { tcol } from '../infra';

/**
 * Gợi ý phản biện theo chuyên môn (đối sánh từ khóa có trọng số, minh bạch, giải thích được) và cảnh báo xung đột lợi ích.
 * Đây là GỢI Ý; Phòng KH/chủ tịch hội đồng quyết định mời ai.
 */

const STOP = new Set(
  'va cua trong cac nhung cho voi ve theo den tai tu mot la co duoc nghien cuu de tai nham phan tich danh gia giai phap viet nam thuc trang anh huong yeu to su cua nguoi the nay khi do nhu hay hoac doi tren duoi sau truoc tac dong ung dung phat trien mo hinh'.split(' '),
);

function terms(text: string): string[] {
  const words = normalizeTitle(text).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    out.add(words[i]);
    if (i + 1 < words.length) out.add(`${words[i]} ${words[i + 1]}`);
  }
  return [...out];
}

export interface ReviewerCandidate {
  uid: string;
  name: string;
  title: string | null;
  unitName: string | null;
  score: number;
  matched: string[];
  expertise: string[];
  conflicts: { level: 'BLOCK' | 'WARN'; reason: string }[];
}

export interface TargetForSuggest {
  ownerUid: string;
  memberUids: string[];
  unitId: string;
  text: string;
}

export async function suggestReviewers(tenantId: string, target: TargetForSuggest, limit = 10): Promise<ReviewerCandidate[]> {
  const [people, profiles, units, pubs] = await Promise.all([
    tcol(tenantId, 'people').where('status', '==', 'ACTIVE').get(),
    tcol(tenantId, 'researcherProfiles').get(),
    tcol(tenantId, 'units').get(),
    tcol(tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).get(),
  ]);
  const unitName = new Map(units.docs.map((d) => [d.id, d.get('name') as string]));
  const profile = new Map(profiles.docs.map((d) => [d.id, d.data()]));
  const pubTitles = new Map<string, string[]>();
  const coauthors = new Map<string, Set<string>>();
  for (const d of pubs.docs) {
    const uids = (d.get('authorUids') as string[]) ?? [];
    for (const u of uids) {
      pubTitles.set(u, [...(pubTitles.get(u) ?? []), d.get('title') as string]);
      const set = coauthors.get(u) ?? new Set<string>();
      uids.filter((x) => x !== u).forEach((x) => set.add(x));
      coauthors.set(u, set);
    }
  }
  const targetTerms = new Set(terms(target.text));
  const ownerUnit = (await tcol(tenantId, 'people').doc(target.ownerUid).get()).get('unitId') as string | undefined;

  const out: ReviewerCandidate[] = [];
  for (const d of people.docs) {
    const uid = d.id;
    const pr = profile.get(uid) ?? {};
    const expertise: string[] = (pr.expertise as string[]) ?? [];
    let score = 0;
    const matched = new Set<string>();
    const add = (text: string, weight: number) => {
      for (const t of terms(text)) {
        if (targetTerms.has(t)) {
          score += weight * (t.includes(' ') ? 2 : 1);
          matched.add(t);
        }
      }
    };
    expertise.forEach((e) => add(e, 3));
    add(String(pr.researchInterests ?? ''), 1.5);
    (pubTitles.get(uid) ?? []).forEach((t) => add(t, 1));
    if (score === 0) continue;

    const conflicts: ReviewerCandidate['conflicts'] = [];
    if (uid === target.ownerUid || target.memberUids.includes(uid)) conflicts.push({ level: 'BLOCK', reason: 'Là chủ nhiệm/thành viên của hồ sơ' });
    if (ownerUnit && d.get('unitId') === ownerUnit && uid !== target.ownerUid) conflicts.push({ level: 'WARN', reason: 'Cùng đơn vị với chủ nhiệm' });
    if (coauthors.get(uid)?.has(target.ownerUid)) conflicts.push({ level: 'WARN', reason: 'Từng là đồng tác giả với chủ nhiệm' });

    out.push({
      uid,
      name: d.get('displayName'),
      title: d.get('title') ?? null,
      unitName: unitName.get(d.get('unitId')) ?? null,
      score: Math.round(score * 10) / 10,
      matched: [...matched].sort((a, b) => b.length - a.length).slice(0, 8),
      expertise,
      conflicts,
    });
  }
  return out
    .sort((a, b) => Number(a.conflicts.some((c) => c.level === 'BLOCK')) - Number(b.conflicts.some((c) => c.level === 'BLOCK')) || b.score - a.score)
    .slice(0, limit);
}
