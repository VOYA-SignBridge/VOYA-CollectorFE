import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import { Suspense, lazy } from "react";

// const DashboardPage = lazy(() => import("./components/dashboard/AnalyticsOverview"));
const LabelsPage = lazy(() => import("./pages/LabelsPage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
// const JobsPage = lazy(() => import("./pages/JobsPage"));
// const SamplesPage = lazy(() => import("./pages/SamplesPage"));

function App() {
  return (
    <Router>
        <Layout>
          <Suspense fallback={<div className="p-6">Loading...</div>}>
            <Routes>
              {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
              <Route path="/labels" element={<LabelsPage />} />
              <Route path="/upload" element={<UploadPage />} />
              {/* <Route path="/jobs" element={<JobsPage />} /> */}
              {/* <Route path="/samples" element={<SamplesPage />} /> */}
              <Route path="/" element={<Navigate to="/upload" />} />
            </Routes>
          </Suspense>
        </Layout>
    </Router>
  );
}

export default App;
