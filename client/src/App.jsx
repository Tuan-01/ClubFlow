import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
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
                <ExecutiveRouteStubPage
                  title="Campaign Setup"
                  heading="Recruitment Campaign Builder"
                  stepLabel="Step C3"
                  endpointHint="GET /api/campaign"
                  subtitle="Configure campaign details, dates, instructions, departments, and positions."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/interview-setup"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveRouteStubPage
                  title="Interview Setup"
                  heading="Interview Setup"
                  stepLabel="Step C4"
                  endpointHint="GET /api/interview-setup"
                  subtitle="Assign interviewers to positions, configure available slots, rooms, and duration."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/applications"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveRouteStubPage
                  title="Application Review"
                  heading="Application Review"
                  stepLabel="Step C7"
                  endpointHint="GET /api/applications"
                  subtitle="Review applications, manage internal notes, and shortlist or reject candidates."
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/executive/scheduling"
            element={
              <ProtectedRoute allowedRoles={['executive']}>
                <ExecutiveRouteStubPage
                  title="Interview Scheduling"
                  heading="Interview Scheduling"
                  stepLabel="Steps C8–C9"
                  endpointHint="GET /api/schedule"
                  subtitle="Generate draft interview timetables, resolve conflicts, and confirm schedule."
                />
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
