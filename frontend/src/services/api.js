import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("neuron_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/** Stale JWT (e.g. DB reset) yields 401 "User not found" — clear token and send user to login. */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || "");
    if (status === 401) {
      const authAttempt = url.includes("/auth/login") || url.includes("/auth/register");
      localStorage.removeItem("neuron_token");
      const path = window.location.pathname;
      if (!authAttempt && !path.startsWith("/login") && !path.startsWith("/demo")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("neuron_token", data.access_token);
  return data;
}

export async function fetchDashboard() {
  const { data } = await api.get("/dashboard/summary");
  return data;
}

export async function listModels() {
  const { data } = await api.get("/models");
  return data;
}

export async function registerModel(payload) {
  const { data } = await api.post("/models/register", payload);
  return data;
}

export async function runAnalysis(payload) {
  const { data } = await api.post("/analysis/run", payload);
  return data;
}

export async function analysisStatus(id) {
  const { data } = await api.get(`/analysis/${id}/status`);
  return data;
}

export async function analysisResults(id) {
  const { data } = await api.get(`/analysis/${id}/results`);
  return data;
}

export async function analysisRetry(id) {
  const { data } = await api.post(`/analysis/${id}/retry`);
  return data;
}

/** Compliance audit PDF (JWT via same token as axios). */
export async function fetchAnalysisCompliancePdfBlob(analysisId) {
  const token = localStorage.getItem("neuron_token");
  const res = await fetch(`/api/v1/analysis/${encodeURIComponent(analysisId)}/report/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = "Download failed";
    try {
      const j = await res.json();
      if (typeof j.detail === "string") detail = j.detail;
      else if (Array.isArray(j.detail)) detail = j.detail.map((x) => x.msg || x).join("; ");
    } catch {
      try {
        const t = await res.text();
        if (t) detail = t.slice(0, 200);
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail);
  }
  return res.blob();
}

export async function trajectoryPreview(modelId, text) {
  const { data } = await api.post("/analysis/trajectory/preview", { model_id: modelId, text });
  return data;
}

export async function trajectoryCompare(modelId, textA, textB) {
  const { data } = await api.post("/analysis/trajectory/compare", {
    model_id: modelId,
    text_a: textA,
    text_b: textB,
  });
  return data;
}

export async function generateReport(payload) {
  const { data } = await api.post("/reports/generate", payload);
  return data;
}

export function pdfUrl(reportId) {
  return `/api/v1/reports/${reportId}/pdf`;
}

export async function fetchMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function listApiKeys() {
  const { data } = await api.get("/auth/api-keys");
  return data;
}

export async function createApiKey(body) {
  const { data } = await api.post("/auth/api-keys", body);
  return data;
}

export async function revokeApiKey(keyId) {
  await api.delete(`/auth/api-keys/${keyId}`);
}

/** JWT-authenticated: retraining checkpoints for a model (UUID or registry name). */
export async function getSdkModelHistory(modelId) {
  const { data } = await api.get(`/sdk/models/${encodeURIComponent(modelId)}/history`);
  return data;
}

export default api;
