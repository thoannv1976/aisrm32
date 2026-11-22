import type { Proposal } from '@aisrm/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PersonPicker, type PersonRef } from '../components/extras';
import { Card, ErrorBox, Field, fmtDateTime } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

/** NCKH sinh viên: chọn giảng viên hướng dẫn, ngành, khóa; giảng viên xác nhận trước khi sinh viên nộp. */
export function StudentCard({ p, editable }: { p: Proposal; editable: boolean }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [sup, setSup] = useState<PersonRef | null>(p.supervisor ? { uid: p.supervisor.uid, name: p.supervisor.name } : null);
  const [major, setMajor] = useState(p.major ?? '');
  const [cohort, setCohort] = useState(p.cohort ?? '');
  const refresh = () => qc.invalidateQueries({ queryKey: ['proposals', p.id] });
  const save = useMutation({ mutationFn: () => api(`/proposals/${p.id}/student`, { method: 'PUT', body: { supervisorUid: sup?.uid ?? null, major: major || null, cohort: cohort || null } }), onSuccess: refresh });
  const act = useMutation({ mutationFn: (a: 'confirm' | 'decline') => api(`/proposals/${p.id}/supervisor/${a}`, { method: 'POST', body: { note: a === 'decline' ? (prompt('Lý do (gửi cho sinh viên):') ?? undefined) : undefined } }), onSuccess: refresh });
  const isSupervisor = p.supervisor?.uid === me?.uid;
  const confirmed = !!p.supervisor?.confirmedAt;
  return (
    <Card title="NCKH sinh viên — người hướng dẫn">
      {editable ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Giảng viên hướng dẫn" required help="Giảng viên nhận thông báo và xác nhận hướng dẫn trước khi bạn nộp hồ sơ.">
            <PersonPicker label="Giảng viên hướng dẫn" value={sup} allowExternal={false} onChange={setSup} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngành">
              <input className="input mt-1" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="vd: Kinh tế quốc tế" />
            </Field>
            <Field label="Khóa">
              <input className="input mt-1" value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="vd: K62" />
            </Field>
          </div>
          <ErrorBox error={save.error} />
          <button className="btn" disabled={save.isPending}>
            Lưu thông tin
          </button>
        </form>
      ) : (
        <div className="text-sm">
          <div>
            Người hướng dẫn: <strong>{p.supervisor?.name ?? '—'}</strong>
          </div>
          <div className="text-slate-600">
            Ngành {p.major ?? '—'} · Khóa {p.cohort ?? '—'}
          </div>
        </div>
      )}
      {p.supervisor && (
        <p className={`mt-3 rounded p-2 text-sm ${confirmed ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {confirmed ? `✓ ${p.supervisor.name} đã xác nhận hướng dẫn (${fmtDateTime(p.supervisor.confirmedAt)}).` : `Chờ ${p.supervisor.name} xác nhận hướng dẫn — chưa thể nộp hồ sơ.`}
          {p.supervisor.note ? ` Ghi chú: ${p.supervisor.note}` : ''}
        </p>
      )}
      {isSupervisor && !confirmed && ['DRAFT', 'NEEDS_REVISION'].includes(p.status) && (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate('confirm')}>
            ✓ Xác nhận hướng dẫn
          </button>
          <button className="btn" disabled={act.isPending} onClick={() => act.mutate('decline')}>
            Từ chối
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </Card>
  );
}
