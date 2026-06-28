// Single API layer for the frontend (see docs/12 "Frontend Conventions" and
// docs/08-api.md). Uses the native fetch API and always sends the session cookie.
//
// NEXT_PUBLIC_API_URL is the API origin (e.g. "http://localhost:5000"). When it is
// not set, requests are relative ("/api/..."), which is correct for same-origin
// hosting behind the ingress.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ---------------------------------------------------------------------------
// Response / request types (mirror the backend DTOs in docs/08-api.md)
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

export interface Profile {
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  projectsCount: number;
  deploymentsCount: number;
}

export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  websiteUrl: string | null;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  buildSummary: string | null;
  errorMessage: string | null;
}

export interface DeploymentLog {
  message: string;
  createdAt: string;
}

export interface CreateDeploymentResult {
  deploymentId: string;
  status: string;
}

export interface MessageResponse {
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
}

export interface ProjectInput {
  name: string;
  repositoryUrl: string;
}

export interface ProfileInput {
  displayName: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

// Thrown for any non-2xx response. Carries the HTTP status and the standardized
// error body ({ message, errors }) so callers can react (401 -> login,
// 403 -> access denied, 500 -> generic message; see docs/12 "Error Handling").
export class ApiError extends Error {
  readonly status: number;
  readonly errors: string[];

  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    // Always include the session cookie (see docs/12 "Fetch Configuration").
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || "Request failed";
  let errors: string[] = [];

  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      if (typeof data.message === "string") {
        message = data.message;
      }
      if (Array.isArray(data.errors)) {
        errors = data.errors;
      }
    }
  } catch {
    // Non-JSON error body; keep the status text as the message.
  }

  return new ApiError(response.status, message, errors);
}

// ---------------------------------------------------------------------------
// Resource methods (see docs/08-api.md)
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    register: (data: RegisterRequest) =>
      apiFetch<MessageResponse>("/api/auth/register", { method: "POST", body: data }),
    login: (data: LoginRequest) =>
      apiFetch<MessageResponse>("/api/auth/login", { method: "POST", body: data }),
    logout: () => apiFetch<MessageResponse>("/api/auth/logout", { method: "POST" }),
    me: (signal?: AbortSignal) => apiFetch<CurrentUser>("/api/auth/me", { signal }),
  },
  profile: {
    get: (signal?: AbortSignal) => apiFetch<Profile>("/api/profile", { signal }),
    update: (data: ProfileInput) =>
      apiFetch<MessageResponse>("/api/profile", { method: "PUT", body: data }),
  },
  projects: {
    list: (signal?: AbortSignal) => apiFetch<Project[]>("/api/projects", { signal }),
    get: (id: string, signal?: AbortSignal) =>
      apiFetch<Project>(`/api/projects/${id}`, { signal }),
    create: (data: ProjectInput) =>
      apiFetch<Project>("/api/projects", { method: "POST", body: data }),
    update: (id: string, data: ProjectInput) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: "PUT", body: data }),
    delete: (id: string) =>
      apiFetch<MessageResponse>(`/api/projects/${id}`, { method: "DELETE" }),
    deploy: (id: string) =>
      apiFetch<CreateDeploymentResult>(`/api/projects/${id}/deploy`, { method: "POST" }),
    deployments: (id: string, signal?: AbortSignal) =>
      apiFetch<Deployment[]>(`/api/projects/${id}/deployments`, { signal }),
  },
  deployments: {
    get: (id: string, signal?: AbortSignal) =>
      apiFetch<Deployment>(`/api/deployments/${id}`, { signal }),
    logs: (id: string, signal?: AbortSignal) =>
      apiFetch<DeploymentLog[]>(`/api/deployments/${id}/logs`, { signal }),
  },
};
