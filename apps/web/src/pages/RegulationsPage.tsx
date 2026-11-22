import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAiStatus } from '../components/ai';
import { Card, Empty, ErrorBox, Field, fmtDate, fmtDateTime, fmtVnd, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { api, errorMessage } from '../lib/api';

interface Regulation {
  id: string;
  code: string;
  title: string;
  issuer: string | null;
  effectiveDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  articleCount: number;
  chunkCount: number;
  sourceFileName: string | null;
  note: string | null;
  uploadedByName: string;
  updatedAt: string;
}
interface Source {
  ref: string;
  regId?: string;
  regCode: string;
  regTitle: string;
  chapter: string | null;
  article: number;
  articleTitle: string;
  clause: number;
  label: string;
  text: string;
  score: number;
}
interface Answer {
  question: string;
  found: boolean;
  text: string;
  sources: Source[];
  unverifiedCitations: string[];
  mock: boolean;
  model: { label: string };
  usage: { inputTokens: number; outputTokens: number; costVnd: number | null; priceKnown: boolean };
  generatedAt: string;
  disclaimer: string;
}

const SAMPLES = [
  'Đề tài được gia hạn tối đa mấy lần, bao lâu?',
  'Thuyết minh cần bao nhiêu điểm thì được đề nghị phê duyệt?',
  'Khi nào thành viên hội đồng bị coi là có xung đột lợi ích?',
  'Bài báo Q1 được thưởng bao nhiêu, chia cho tác giả thế nào?',
  'Sinh viên làm đề tài theo nhóm tối đa mấy người?',
  'Chậm nộp báo cáo tiến độ thì bị xử lý thế nào?',
];

export function RegulationsPage() {
  const [tab, setTab] = useState<'ask' | 'docs'>('ask');
  const list = useQuery({ queryKey: ['regulations'], queryFn: () => api<{ items: Regulation[]; canManage: boolean }>('/regulations') });
  return (
    <>
      <PageHeader title="Hỏi đáp quy chế" subtitle="Tra cứu quy chế khoa học và công nghệ bằng câu hỏi tự nhiên — câu trả lời luôn dẫn điều, khoản làm căn cứ." />
      <Tabs
        tabs={[
          { key: 'ask', label: 'Hỏi đáp' },
          { key: 'docs', label: 'Văn bản quy chế', count: list.data?.items.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'ask' ? <AskPanel regs={list.data?.items ?? []} /> : <DocsPanel q={list} />}
    </>
  );
}

function AskPanel({ regs }: { regs: Regulation[] }) {
  const status = useAiStatus();
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Answer[]>([]);
  const [view, setView] = useState<Source | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const m = useMutation({
    mutationFn: (q: string) => api<Answer>('/regulations/ask', { method: 'POST', body: { question: q } }),
    onSuccess: (a) => {
      setHistory((h) => [...h, a]);
      setQuestion('');
    },
  });
  useEffect(() => {
    // scrollIntoView có thể trả về Promise trên trình duyệt mới — không để effect trả giá trị
    if (history.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history.length]);
  const active = regs.filter((r) => r.status === 'ACTIVE');
  const submit = (q: string) => q.trim().length >= 3 && !m.isPending && m.mutate(q.trim());
  const regIdOf = (code: string) => regs.find((r) => r.code === code)?.id;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {history.length === 0 && (
          <Card title="Gợi ý câu hỏi">
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button key={s} className="btn text-left text-xs" onClick={() => submit(s)} disabled={m.isPending || status.data?.enabled === false}>
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {history.map((a, i) => (
          <AnswerCard key={i} a={a} onView={setView} />
        ))}
        {m.isPending && <p className="text-sm text-slate-500">Đang tra cứu quy chế…</p>}
        <ErrorBox error={m.error} />
        <div ref={endRef} />
        <form
          className="card sticky bottom-3 flex gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <label className="sr-only" htmlFor="reg-q">
            Câu hỏi về quy chế
          </label>
          <textarea
            id="reg-q"
            className="input min-h-[44px] flex-1 resize-y"
            rows={1}
            maxLength={500}
            placeholder="Ví dụ: Đề nghị gia hạn phải nộp trước bao nhiêu ngày?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
          />
          <button className="btn btn-primary self-end" disabled={m.isPending || question.trim().length < 3 || status.data?.enabled === false}>
            Hỏi
          </button>
        </form>
        {status.data?.enabled === false && <p className="text-xs text-amber-800">AI đang tạm tắt theo cấu hình quản trị. Anh/chị vẫn xem được toàn văn quy chế ở tab "Văn bản quy chế".</p>}
      </div>
      <div className="space-y-4">
        <Card title="Phạm vi tra cứu">
          {active.length === 0 ? (
            <Empty>Chưa có văn bản quy chế nào được nạp.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {active.map((r) => (
                <li key={r.id}>
                  <Link className="link" to={`/regulations/${r.id}`}>
                    {r.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.code} · {r.articleCount} điều · hiệu lực {fmtDate(r.effectiveDate)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Trợ lý chỉ trả lời dựa trên các văn bản trên. Không tìm thấy căn cứ thì trả lời "không tìm thấy" — không suy đoán. Câu hỏi không được lưu lại.
          </p>
        </Card>
      </div>
      <Modal open={!!view} title={view ? `${view.label[0].toUpperCase()}${view.label.slice(1)} — ${view.articleTitle}` : ''} onClose={() => setView(null)}>
        {view && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              {view.regTitle} ({view.regCode}){view.chapter ? ` · ${view.chapter}` : ''}
            </p>
            <p className="whitespace-pre-line leading-relaxed">{view.text}</p>
            {regIdOf(view.regCode) && (
              <Link className="link text-xs" to={`/regulations/${regIdOf(view.regCode)}#dieu-${view.article}`}>
                Xem toàn văn Điều {view.article} →
              </Link>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function AnswerCard({ a, onView }: { a: Answer; onView: (s: Source) => void }) {
  return (
    <div className="space-y-2">
      <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-brand-700 px-3 py-2 text-sm text-white">{a.question}</div>
      <section className="card p-4">
        {!a.found && <p className="mb-2 text-xs font-medium text-amber-800">⚠ Không đủ căn cứ trong quy chế đã nạp</p>}
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-900">{a.text}</p>
        {a.unverifiedCitations.length > 0 && (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
            Cảnh báo: câu trả lời dẫn {a.unverifiedCitations.join(', ')} nhưng không có trong văn bản đã nạp — không sử dụng phần này.
          </p>
        )}
        {a.sources.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.found ? 'Căn cứ' : 'Điều khoản gần nhất (tham khảo)'}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {a.sources.map((s) => (
                <button key={s.ref} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:border-brand-300 hover:text-brand-800" onClick={() => onView(s)}>
                  {s.label} · {s.articleTitle}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-snug text-slate-500">
          {a.found ? (a.mock ? 'Chế độ giả lập' : a.model.label) : 'Không gọi AI'} · {fmtDateTime(a.generatedAt)}
          {a.found && !a.mock && ` · ${a.usage.inputTokens}+${a.usage.outputTokens} token · ${a.usage.priceKnown ? fmtVnd(a.usage.costVnd) : 'chi phí chưa xác định'}`}
          <br />
          <em>{a.disclaimer}</em>
        </p>
      </section>
    </div>
  );
}

function DocsPanel({ q }: { q: ReturnType<typeof useQuery<{ items: Regulation[]; canManage: boolean }>> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const toggle = useMutation({
    mutationFn: (r: Regulation) => api(`/regulations/${r.id}`, { method: 'PATCH', body: { status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regulations'] }),
  });
  if (q.isLoading) return <Loading />;
  return (
    <Card title="Văn bản quy chế" actions={q.data?.canManage && <button className="btn btn-primary text-xs" onClick={() => setOpen(true)}>+ Nạp văn bản</button>}>
      <ErrorBox error={q.error ?? toggle.error} />
      {!q.data?.items.length ? (
        <Empty>Chưa có văn bản.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Văn bản</th>
                <th>Hiệu lực</th>
                <th>Điều / đoạn</th>
                <th>Cập nhật</th>
                <th>Trạng thái</th>
                {q.data.canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="link" to={`/regulations/${r.id}`}>
                      {r.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.code} · phiên bản {r.version}
                      {r.sourceFileName ? ` · ${r.sourceFileName}` : ''}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(r.effectiveDate)}</td>
                  <td className="whitespace-nowrap">
                    {r.articleCount} / {r.chunkCount}
                  </td>
                  <td className="text-xs text-slate-600">
                    {fmtDateTime(r.updatedAt)}
                    <br />
                    {r.uploadedByName}
                  </td>
                  <td>
                    <StatusBadge status={r.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'} label={r.status === 'ACTIVE' ? 'Đang dùng' : 'Tạm ngưng'} />
                  </td>
                  {q.data.canManage && (
                    <td>
                      <button className="btn text-xs" disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
                        {r.status === 'ACTIVE' ? 'Tạm ngưng' : 'Dùng lại'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} title="Nạp văn bản quy chế" onClose={() => setOpen(false)}>
        <UploadForm onDone={() => setOpen(false)} />
      </Modal>
    </Card>
  );
}

interface Preview {
  heading: string | null;
  articleCount: number;
  clauseCount: number;
  chapters: string[];
  firstArticles: string[];
  warnings: string[];
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const m = useMutation({
    mutationFn: (dryRun: boolean) => {
      const fd = new FormData();
      fd.set('code', code.trim());
      fd.set('title', title.trim());
      fd.set('effectiveDate', effectiveDate);
      fd.set('dryRun', String(dryRun));
      fd.set('file', file!);
      return api<{ dryRun: boolean; preview: Preview }>('/regulations', { method: 'POST', body: fd });
    },
    onSuccess: (r) => {
      if (r.dryRun) setPreview(r.preview);
      else {
        qc.invalidateQueries({ queryKey: ['regulations'] });
        onDone();
      }
    },
  });
  const ready = code.trim().length >= 2 && title.trim().length >= 3 && !!file;
  return (
    <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), ready && m.mutate(!preview))}>
      <Field label="Mã văn bản" required help="Nạp lại cùng mã sẽ thay thế nội dung cũ (tăng phiên bản).">
        <input className="input" value={code} onChange={(e) => (setCode(e.target.value), setPreview(null))} placeholder="VD: QC-KHCN-2026" />
      </Field>
      <Field label="Tên văn bản" required>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Ngày hiệu lực">
        <input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
      </Field>
      <Field label="Tệp văn bản" required help="Word (.docx), .txt hoặc .md; tối đa 5 MB. Văn bản cần có các dòng 'Điều 1.', 'Điều 2.'… và khoản đánh số '1.', '2.'.">
        <input type="file" className="input" accept=".docx,.txt,.md" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPreview(null))} />
      </Field>
      {preview && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium">Kết quả tách văn bản</div>
          <p className="mt-1 text-slate-700">
            {preview.heading ?? '(không rõ tiêu đề)'} — {preview.chapters.length} chương, {preview.articleCount} điều, {preview.clauseCount} khoản.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
            {preview.firstArticles.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {m.error && <p className="text-sm text-red-700">{errorMessage(m.error)}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Hủy
        </button>
        <button className="btn btn-primary" disabled={!ready || m.isPending}>
          {m.isPending ? 'Đang xử lý…' : preview ? 'Xác nhận nạp' : 'Xem trước'}
        </button>
      </div>
    </form>
  );
}

/** Toàn văn một văn bản, theo chương / điều / khoản; neo #dieu-N. */
export function RegulationDetailPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const q = useQuery({
    queryKey: ['regulations', id],
    queryFn: () => api<{ item: Regulation; articles: { chapter: string | null; number: number; title: string; clauses: { no: number; text: string; ref: string }[] }[] }>(`/regulations/${id}`),
  });
  useEffect(() => {
    if (!q.data) return;
    const h = window.location.hash.slice(1);
    if (h) document.getElementById(h)?.scrollIntoView({ block: 'start' });
  }, [q.data, sp]);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { item, articles } = q.data;
  let lastChapter: string | null = null;
  return (
    <>
      <PageHeader
        back={<Link to="/regulations" className="link text-sm">← Hỏi đáp quy chế</Link>}
        title={item.title}
        subtitle={`${item.code} · phiên bản ${item.version} · hiệu lực ${fmtDate(item.effectiveDate)}${item.issuer ? ` · ${item.issuer}` : ''}`}
      />
      {item.note && <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{item.note}</p>}
      <Card>
        <article className="space-y-4 text-sm leading-relaxed">
          {articles.map((a) => {
            const showChapter = a.chapter && a.chapter !== lastChapter;
            lastChapter = a.chapter;
            return (
              <div key={a.number}>
                {showChapter && <h2 className="mb-3 mt-6 text-center font-semibold uppercase text-slate-800">{a.chapter}</h2>}
                <h3 id={`dieu-${a.number}`} className="scroll-mt-20 font-semibold text-slate-900">
                  Điều {a.number}. {a.title}
                </h3>
                {a.clauses.map((c) => (
                  <p key={c.ref} className="mt-1 whitespace-pre-line text-slate-800">
                    {c.no > 0 && <span className="font-medium">{c.no}. </span>}
                    {c.text}
                  </p>
                ))}
              </div>
            );
          })}
        </article>
      </Card>
    </>
  );
}
