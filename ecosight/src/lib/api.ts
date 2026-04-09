/**
 * EcoSight API Client
 * Connects the Next.js frontend to the FastAPI backend.
 * Set NEXT_PUBLIC_API_URL in .env.local to point to your backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () => apiFetch("/dashboard/stats");

// ── Reports ──────────────────────────────────────────────────────────────────
export const getReports = (timeframe: "daily" | "weekly" | "monthly") =>
  apiFetch(`/reports?timeframe=${timeframe}`);

// ── Bins ─────────────────────────────────────────────────────────────────────
export const getBins = () => apiFetch("/bins/");
export const createBin = (data: object) =>
  apiFetch("/bins/", { method: "POST", body: JSON.stringify(data) });
export const updateBin = (id: string, data: object) =>
  apiFetch(`/bins/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteBin = (id: string) =>
  apiFetch(`/bins/${id}`, { method: "DELETE" });
export const emptyBin = (id: string) =>
  apiFetch(`/bins/${id}/empty`, { method: "POST" });

// ── Cameras ───────────────────────────────────────────────────────────────────
export const getCameras = () => apiFetch("/cameras/");
export const createCamera = (data: object) =>
  apiFetch("/cameras/", { method: "POST", body: JSON.stringify(data) });
export const updateCamera = (id: string, data: object) =>
  apiFetch(`/cameras/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteCamera = (id: string) =>
  apiFetch(`/cameras/${id}`, { method: "DELETE" });

// ── Audit Log ─────────────────────────────────────────────────────────────────
export const getAuditLog = (params: {
  page?: number;
  page_size?: number;
  waste_type?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
}) => {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.waste_type && params.waste_type !== "All")
    q.set("waste_type", params.waste_type);
  if (params.date) q.set("date", params.date);
  if (params.start_date) q.set("start_date", params.start_date);
  if (params.end_date) q.set("end_date", params.end_date);
  return apiFetch(`/audit-log?${q.toString()}`);
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const getAlerts = (resolved?: boolean) =>
  apiFetch(`/alerts${resolved !== undefined ? `?resolved=${resolved}` : ""}`);
export const resolveAlert = (id: string) =>
  apiFetch(`/alerts/${id}/resolve`, { method: "POST" });

// ── Video Processing ──────────────────────────────────────────────────────────
export const getSessions = (binId?: string) =>
  apiFetch(`/video/sessions${binId ? `?bin_id=${binId}` : ""}`);
export const getSession = (sessionId: string) =>
  apiFetch(`/video/sessions/${sessionId}`);
export const getResultVideoUrl = (sessionId: string) =>
  `${API_BASE}/video/result/${sessionId}`;

export const uploadVideo = async (
  file: File,
  binId: string,
  cameraId?: string,
  onProgress?: (pct: number) => void
): Promise<{ session_id: string; ws_url: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bin_id", binId);
  if (cameraId) formData.append("camera_id", cameraId);

  // Use XHR for upload progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/video/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
};

// ── WebSocket helper ──────────────────────────────────────────────────────────
export const getWsUrl = (sessionId: string) => {
  const wsBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api")
    .replace(/^http/, "ws");
  return `${wsBase}/video/ws/${sessionId}`;
};

// ── Model status ──────────────────────────────────────────────────────────────
export const getModelStatus = () => apiFetch("/models/status");


// ── Webcam WebSocket ──────────────────────────────────────────────────────────
export const getWebcamWsUrl = () => {
  const wsBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api")
    .replace(/^http/, "ws");
  return `${wsBase}/webcam/stream`;
};

// ── Users ───────────────────────────────────────────────────────────────────
export const getUsers = () => apiFetch("/users/");
export const createUser = (data: any) =>
  apiFetch("/users/", { method: "POST", body: JSON.stringify(data) });
export const deleteUser = (id: string) =>
  apiFetch(`/users/${id}`, { method: "DELETE" });

