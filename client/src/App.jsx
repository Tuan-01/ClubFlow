import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ExecutiveCampaignPage } from './pages/ExecutiveCampaignPage';
import { ExecutiveInterviewSetupPage } from './pages/ExecutiveInterviewSetupPage';
import { ExecutiveApplicationsPage } from './pages/ExecutiveApplicationsPage';
import { ExecutiveSchedulingPage } from './pages/ExecutiveSchedulingPage';
import {
  ApplicationDetailStubPage,
  ApplyStubPage,
  ExecutiveRouteStubPage,
  InterviewerInterviewsStubPage,
  MyApplicationsStubPage,
  PublicCampaignStubPage
} from './pages/StubPages';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicCampaignStubPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/apply"
            element={
              <ProtectedRoute allowedRoles={['applicant']}>
                <ApplyStubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications"
            element={
              <ProtectedRoute allowedRoles={['applicant']}>
                <MyApplicationsStubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/:id"
            element={
              <ProtectedRoute allowedRoles={['applicant']}>
                <ApplicationDetailStubPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/interviewer/interviews"
            element={
              <ProtectedRoute allowedRoles={['interviewer']}>
                <InterviewerInterviewsStubPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/executive/campaign"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveCampaignPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/interview-setup"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveInterviewSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/applications"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveApplicationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/scheduling"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveSchedulingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/results"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveRouteStubPage
                  title="Final Results"
                  heading="Final Recruitment Results"
                  stepLabel="Step C11"
                  endpointHint="GET /api/results"
                  subtitle="Record Pass/Fail decisions and publish final results to applicants."
                />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
