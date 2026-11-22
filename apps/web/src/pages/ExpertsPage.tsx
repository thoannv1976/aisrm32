import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart } from '../components/extras';
import { Card, Empty, ErrorBox, Loading, PageHeader, Tabs } from '../components/ui';
import { api } from '../lib/api';

interface Expert {
  uid: string;
  displayName: string;
  title: string | null;
  unitName: string | null;
  expertise: string[];
  external: boolean;
  publications: number;
  projects: number;
  score: number;
  evidence: string[];
}

function SearchTab() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const r = useQuery({ queryKey: ['experts', q], queryFn: () => api<{ items: Expert[]; formula: string }>(`/experts/search?q=${encodeURIComponent(q)}`) });
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), setQ(text))}>
        <input className="input max-w-xl" placeholder="Chủ đề / từ khóa, vd: xuất khẩu nông sản, logistics, marketing…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Từ khóa tìm chuyên gia" />
        <button className="btn btn-primary">Tìm chuyên gia</button>
      </form>
      {r.isLoading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : r.data!.items.length === 0 ? (
        <Empty>Không tìm thấy người phù hợp.</Empty>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {r.data!.items.map((x) => (
              <li key={x.uid} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link className="link font-semibold" to={`/researchers/${x.uid}`}>{x.displayName}</Link>
                    {x.external && <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs text-amber-800">Ngoài trường</span>}
                    <div className="text-xs text-slate-500">{x.title} · {x.unitName}</div>
                  </div>
                  <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800" title="Điểm phù hợp">{x.score}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">{x.expertise.map((e) => <span key={e} className="rounded bg-slate-100 px-1.5 text-xs">{e}</span>)}</div>
                <div className="mt-2 text-xs text-slate-600">{x.publications} công bố đã xác nhận · {x.projects} đề tài</div>
                {x.evidence.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs text-slate-600">
                    {x.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Cách tính: {r.data!.formula} Không dùng AI để chấm.</p>
        </>
      )}
    </div>
  );
}

interface Net {
  nodes: { uid: string; name: string; unitName: string | null; unitId: string | null; publications: number }[];
  links: { a: string; b: string; weight: number; titles: string[] }[];
  stats: { people: number; collaborations: number; crossUnit: number };
  note: string;
}

const PALETTE = ['#1d4ed8', '#b45309', '#047857', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#a21caf'];

function NetworkTab() {
  const r = useQuery({ queryKey: ['experts-network'], queryFn: () => api<Net>('/experts/network') });
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    if (!r.data) return null;
    const nodes = [...r.data.nodes].sort((a, b) => (a.unitName ?? '').localeCompare(b.unitName ?? '', 'vi'));
    const units = [...new Set(nodes.map((n) => n.unitName ?? '—'))];
    const R = 220;
    const pos = new Map(nodes.map((n, i) => [n.uid, { x: 300 + R * Math.cos((2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2), y: 280 + R * Math.sin((2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2) }]));
    return { nodes, units, pos };
  }, [r.data]);
  if (r.isLoading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data!;
  if (!layout || d.nodes.length === 0) return <Empty>Chưa có công bố đã xác nhận có từ hai tác giả trong trường.</Empty>;
  const color = (u: string | null) => PALETTE[layout.units.indexOf(u ?? '—') % PALETTE.length];
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <Card title="Mạng lưới đồng tác giả">
        <svg viewBox="0 0 600 560" className="mx-auto w-full max-w-2xl" role="img" aria-label="Sơ đồ mạng lưới đồng tác giả">
          {d.links.map((l, i) => {
            const a = layout.pos.get(l.a)!;
            const b = layout.pos.get(l.b)!;
            const on = !hover || hover === l.a || hover === l.b;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeOpacity={on ? 0.7 : 0.1} strokeWidth={1 + l.weight * 1.5}><title>{l.titles.join(' · ')}</title></line>;
          })}
          {layout.nodes.map((n) => {
            const p = layout.pos.get(n.uid)!;
            const rad = 8 + Math.min(n.publications, 10) * 1.5;
            const left = p.x < 300;
            return (
              <g key={n.uid} onMouseEnter={() => setHover(n.uid)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
                <a href={`/researchers/${n.uid}`}>
                  <circle cx={p.x} cy={p.y} r={rad} fill={color(n.unitName)} stroke="#fff" strokeWidth="2" />
                  <text x={p.x + (left ? -rad - 4 : rad + 4)} y={p.y + 4} fontSize="11" textAnchor={left ? 'end' : 'start'} className="fill-slate-800">{n.name}</text>
                  <title>{`${n.name} — ${n.unitName ?? ''}: ${n.publications} công bố`}</title>
                </a>
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-slate-500">Kích thước nút theo số công bố; độ dày cạnh theo số bài chung. Rê chuột để xem. {d.note}</p>
      </Card>
      <aside className="space-y-4">
        <Card title="Thống kê">
          <ul className="space-y-1 text-sm">
            <li>Nhà khoa học trong mạng lưới: <strong>{d.stats.people}</strong></li>
            <li>Cặp hợp tác: <strong>{d.stats.collaborations}</strong></li>
            <li>Hợp tác liên đơn vị: <strong>{d.stats.crossUnit}</strong></li>
          </ul>
        </Card>
        <Card title="Đơn vị">
          <ul className="space-y-1 text-sm">
            {layout.units.map((u) => (
              <li key={u} className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: color(u) }} />{u}</li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

interface Comp {
  units: { unitName: string; researchers: number; publications: number; projects: number; groups: number; strongGroups: number; topExpertise: { name: string; count: number }[]; fields: { name: string; count: number }[] }[];
  topExpertise: { name: string; count: number }[];
}

function CompetencyTab() {
  const r = useQuery({ queryKey: ['experts-competency'], queryFn: () => api<Comp>('/experts/competency') });
  if (r.isLoading) return <Loading />;
  if (r.error) return <ErrorBox error={r.error} />;
  const d = r.data!;
  return (
    <div className="space-y-5">
      <Card title="Chuyên môn phổ biến toàn trường (số người khai)">
        <BarChart rows={d.topExpertise.map((x) => ({ name: x.name, count: x.count }))} label="name" value="count" max={20} title="Chuyên môn phổ biến" />
      </Card>
      <Card title="Bản đồ năng lực theo đơn vị">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Đơn vị</th>
                <th className="text-right">Nhà KH</th>
                <th className="text-right">Công bố</th>
                <th className="text-right">Đề tài</th>
                <th className="text-right">Nhóm NC (mạnh)</th>
                <th>Chuyên môn nổi bật</th>
                <th>Lĩnh vực đề tài</th>
              </tr>
            </thead>
            <tbody>
              {d.units.map((u) => (
                <tr key={u.unitName}>
                  <td className="font-medium">{u.unitName}</td>
                  <td className="text-right">{u.researchers}</td>
                  <td className="text-right">{u.publications}</td>
                  <td className="text-right">{u.projects}</td>
                  <td className="text-right">{u.groups} ({u.strongGroups})</td>
                  <td className="text-xs">{u.topExpertise.map((x) => `${x.name} (${x.count})`).join(', ') || '—'}</td>
                  <td className="text-xs">{u.fields.map((x) => `${x.name} (${x.count})`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ExpertsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'search' | 'network' | 'competency') ?? 'search';
  return (
    <>
      <PageHeader title="Chuyên gia & năng lực nghiên cứu" subtitle="Tìm chuyên gia theo chủ đề, mạng lưới hợp tác, bản đồ năng lực — từ hồ sơ khoa học và kết quả đã xác nhận." />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ key: 'search', label: 'Tìm chuyên gia' }, { key: 'network', label: 'Mạng lưới hợp tác' }, { key: 'competency', label: 'Bản đồ năng lực' }]} />
      {tab === 'search' ? <SearchTab /> : tab === 'network' ? <NetworkTab /> : <CompetencyTab />}
    </>
  );
}
