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
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ProjectDetailPage, ProjectsPage } from './pages/ProjectsPages';
import { ProposalDetailPage, ProposalsPage } from './pages/ProposalsPages';
import { PublicationDetailPage, PublicationFormPage, PublicationsPage } from './pages/PublicationsPages';
import { RegulationDetailPage, RegulationsPage } from './pages/RegulationsPage';
import { ResearcherPage } from './pages/ResearcherPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { RegistryDetailPage, RegistryFormPage, RegistryHubPage, RegistryListPage } from './pages/RegistryPages';
import { ExpertsPage } from './pages/ExpertsPage';
import { StudentResearchPage } from './pages/StudentResearchPage';
import { OrcidImportPage } from './pages/PublicationExtras';
import { DelegationsTab, ExternalReviewersTab } from './pages/AdminExtTabs';
import { PageHeader } from './components/ui';

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
  const { user, ready, mode, mustChangePassword, me, meLoading, meError, logout } = useSession();
  if (!ready) return <Loading label="Đang khởi động…" />;
  if (!user) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordPage forced />;
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
        <Route path="regulations" element={<RegulationsPage />} />
        <Route path="regulations/:id" element={<RegulationDetailPage />} />
        <Route path="publications" element={<PublicationsPage />} />
        <Route path="publications/new" element={<PublicationFormPage />} />
        <Route path="publications/orcid" element={<OrcidImportPage />} />
        <Route path="registry" element={<RegistryHubPage />} />
        <Route path="registry/:kind" element={<RegistryListPage />} />
        <Route path="registry/:kind/new" element={<RegistryFormPage />} />
        <Route path="registry/:kind/:id" element={<RegistryDetailPage />} />
        <Route path="registry/:kind/:id/edit" element={<RegistryFormPage />} />
        <Route path="experts" element={<ExpertsPage />} />
        <Route path="student-research" element={<StudentResearchPage />} />
        <Route path="delegations" element={<><PageHeader title="Ủy quyền" subtitle="Ủy quyền vai trò có thời hạn khi vắng mặt" /><DelegationsTab /></>} />
        <Route path="external-reviewers" element={<><PageHeader title="Phản biện ngoài trường" subtitle="Tài khoản có thời hạn, chỉ xem hồ sơ được mời chấm" /><ExternalReviewersTab /></>} />
        <Route path="publications/:id" element={<PublicationDetailPage />} />
        <Route path="publications/:id/edit" element={<PublicationFormPage />} />
        <Route path="profile" element={<ResearcherPage self />} />
        <Route path="researchers/:uid" element={<ResearcherPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="ai" element={<AiCenterPage />} />
        <Route path="integrations" element={<IntegrationCenterPage />} />
        <Route path="admin" element={<AdminPage />} />
        {mode === 'local' && <Route path="account/password" element={<ChangePasswordPage />} />}
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
