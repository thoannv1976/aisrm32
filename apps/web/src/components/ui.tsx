import { stateLabel, type WorkflowKey } from '@aisrm/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';

export const fmtDate = (s?: string | null) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('vi-VN') : '—');
export const fmtDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    : '—';
export const fmtVnd = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('vi-VN').format(n) + ' ₫');

const TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-300',
  NEEDS_REVISION: 'bg-amber-50 text-amber-800 ring-amber-300',
  COMPLETION_REVISION: 'bg-amber-50 text-amber-800 ring-amber-300',
  APPROVED: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  CONFIRMED: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  ACTIVE: 'bg-sky-50 text-sky-800 ring-sky-300',
  REJECTED: 'bg-red-50 text-red-800 ring-red-300',
  CANCELLED: 'bg-red-50 text-red-800 ring-red-300',
  WITHDRAWN: 'bg-slate-100 text-slate-500 ring-slate-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-300',
  EXPORTED: 'bg-slate-100 text-slate-600 ring-slate-300',
  SUSPENDED: 'bg-orange-50 text-orange-800 ring-orange-300',
  OVERDUE: 'bg-red-50 text-red-800 ring-red-300',
};

const ICON: Record<string, string> = {
  APPROVED: '✓',
  CONFIRMED: '✓',
  COMPLETED: '✓',
  REJECTED: '✕',
  CANCELLED: '✕',
  NEEDS_REVISION: '↺',
  COMPLETION_REVISION: '↺',
  DRAFT: '✎',
  OVERDUE: '!',
};

/** Nhãn trạng thái: chữ + ký hiệu, không dùng màu là tín hiệu duy nhất. */
export function StatusBadge({ wf, status, label }: { wf?: WorkflowKey; status: string; label?: string }) {
  const text = label ?? (wf ? stateLabel(wf, status) : status);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[status] ?? 'bg-indigo-50 text-indigo-800 ring-indigo-200'}`}>
      {ICON[status] && <span aria-hidden>{ICON[status]}</span>}
      {text}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <div className="mb-1 text-sm">{back}</div>}
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-600">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const details = (error as { body?: { details?: { field?: string; message: string }[]; requestId?: string } }).body;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="font-medium">{errorMessage(error)}</div>
      {Array.isArray(details?.details) && (
        <ul className="mt-1 list-disc pl-5">
          {details!.details!.map((d, i) => (
            <li key={i}>{d.message}</li>
          ))}
        </ul>
      )}
      {details?.requestId && <div className="mt-1 text-xs text-red-600">Mã yêu cầu: {details.requestId}</div>}
      {onRetry && (
        <button className="btn mt-2" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('textarea, input, select')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(560px,calc(100vw-32px))] rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className="p-4">{open && children}</div>
    </dialog>
  );
}

export function Field({ label, required, help, children, error }: { label: string; required?: boolean; help?: string; children: ReactNode; error?: string }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-600"> *</span>}
        {children}
      </label>
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
