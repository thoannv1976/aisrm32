import type { MeResponse, Role } from '@aisrm/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setTenant } from './api';
import { auth } from './firebase';

interface Session {
  user: User | null;
  ready: boolean;
  me: MeResponse | undefined;
  meLoading: boolean;
  meError: unknown;
  /** Vai trò đang dùng để hiển thị menu/trang làm việc (quyền thật luôn kiểm tra ở server). */
  activeRole: Role | null;
  setActiveRole: (r: Role) => void;
  hasRole: (...roles: Role[]) => boolean;
  switchTenant: (id: string) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
const ROLE_KEY = 'aisrm.activeRole';
/** Vai trò mặc định khi đăng nhập: ưu tiên vai trò quản lý/xử lý hồ sơ. */
const ROLE_PRIORITY: Role[] = [
  'RECTOR',
  'VICE_RECTOR',
  'SCIENCE_HEAD',
  'SCIENCE_OFFICER',
  'UNIT_HEAD',
  'UNIT_FOCAL',
  'SYS_ADMIN',
  'AI_ADMIN',
  'INTEGRATION_ADMIN',
  'BOARD',
  'REVIEWER',
  'SUPERVISOR',
  'RESEARCHER',
  'STUDENT',
];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [activeRole, setActiveRoleState] = useState<Role | null>(() => {
    try {
      return localStorage.getItem(ROLE_KEY) as Role | null;
    } catch {
      return null;
    }
  });
  const qc = useQueryClient();

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );

  const meQ = useQuery({
    queryKey: ['me', user?.uid],
    queryFn: () => api<MeResponse>('/me'),
    enabled: !!user,
    retry: false,
  });

  const me = meQ.data;
  useEffect(() => {
    if (me && (!activeRole || !me.roles.includes(activeRole))) {
      setActiveRoleState(ROLE_PRIORITY.find((r) => me.roles.includes(r)) ?? me.roles[0] ?? null);
    }
  }, [me, activeRole]);

  const value = useMemo<Session>(
    () => ({
      user,
      ready,
      me,
      meLoading: meQ.isLoading,
      meError: meQ.error,
      activeRole,
      setActiveRole: (r) => {
        setActiveRoleState(r);
        try {
          localStorage.setItem(ROLE_KEY, r);
        } catch {
          /* bỏ qua */
        }
      },
      hasRole: (...roles) => !!me?.roles.some((r) => roles.includes(r)),
      switchTenant: (id) => {
        setTenant(id);
        qc.clear();
        window.location.assign('/');
      },
      logout: async () => {
        await signOut(auth);
        qc.clear();
      },
    }),
    [user, ready, me, meQ.isLoading, meQ.error, activeRole, qc],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
