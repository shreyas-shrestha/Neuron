import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Landing from "./pages/Landing.jsx";
import Demo from "./pages/Demo.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Analysis from "./pages/Analysis.jsx";
import ModelRegistry from "./pages/ModelRegistry.jsx";
import Reports from "./pages/Reports.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Settings from "./pages/Settings.jsx";

function DocsPlaceholder() {
  return (
    <div className="max-w-lg mx-auto py-16 px-6 text-center">
      <h1 className="font-display font-semibold text-xl text-neuron-primary">Documentation</h1>
      <p className="text-neuron-secondary text-sm mt-2 font-sans">SDK and integration docs will live here.</p>
    </div>
  );
}

/** Authenticated app shell: Layout + Outlet. Unauthenticated / → Landing; other paths → /. */
function WorkspaceShell() {
  const token = localStorage.getItem("neuron_token");
  const loc = useLocation();
  if (!token) {
    if (loc.pathname === "/") return <Landing />;
    return <Navigate to="/" replace />;
  }
  return <Layout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/demo" element={<Demo />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<WorkspaceShell />}>
          <Route index element={<ModelRegistry />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="docs" element={<DocsPlaceholder />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="settings" element={<Settings />} />
          <Route path="analysis/:id" element={<Analysis />} />
          <Route path="models" element={<ModelRegistry />} />
          <Route path="reports/:analysisId" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
