import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBox, Loading } from './components/ui';
import './index.css';
import { ApiFailure } from './lib/api';
import { SessionProvider, useSession } from './lib/session';
import { AdminPage } from './pages/AdminPage';
import { AiCenterPage } from './pages/AiCenterPage';
import { IntegrationCenterPage } from './pages/IntegrationCenterPage';
import { CallDetailPage, CallNewPage, CallsPage } from './pages/CallsPages';
import { CouncilDetailPage, CouncilsPage } from './pages/CouncilsPages';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectDetailPage, ProjectsPage } from './pages/ProjectsPages';
import { ProposalDetailPage, ProposalsPage } from './pages/ProposalsPages';
import { PublicationDetailPage, PublicationFormPage, PublicationsPage } from './pages/PublicationsPages';
import { ResearcherPage } from './pages/ResearcherPage';
import { WorkspacePage } from './pages/WorkspacePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, e) => !(e instanceof ApiFailure && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function Gate() {
  const { user, ready, me, meLoading, meError, logout } = useSession();
  if (!ready) return <Loading label="Đang khởi động…" />;
  if (!user) return <LoginPage />;
  if (meLoading) return <Loading label="Đang tải thông tin tài khoản…" />;
  if (meError || !me)
    return (
      <div className="mx-auto mt-20 max-w-lg space-y-3 p-4">
        <ErrorBox error={meError} />
        <button className="btn" onClick={() => logout()}>
          Đăng xuất
        </button>
      </div>
    );
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorkspacePage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="calls/new" element={<CallNewPage />} />
        <Route path="calls/:id" element={<CallDetailPage />} />
        <Route path="proposals" element={<ProposalsPage />} />
        <Route path="proposals/:id" element={<ProposalDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="councils" element={<CouncilsPage />} />
        <Route path="councils/:id" element={<CouncilDetailPage />} />
        <Route path="publications" element={<PublicationsPage />} />
        <Route path="publications/new" element={<PublicationFormPage />} />
        <Route path="publications/:id" element={<PublicationDetailPage />} />
        <Route path="publications/:id/edit" element={<PublicationFormPage />} />
        <Route path="profile" element={<ResearcherPage self />} />
        <Route path="researchers/:uid" element={<ResearcherPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="ai" element={<AiCenterPage />} />
        <Route path="integrations" element={<IntegrationCenterPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
