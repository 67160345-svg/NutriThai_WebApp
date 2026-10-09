export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface ApiUser {
  id: string;
  email: string | null;
  username: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function refreshSession(): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  return response.status === 200;
}

export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const isAuthEntry = [
    "/api/v1/auth/login",
    "/api/v1/auth/signup",
    "/api/v1/auth/refresh",
    "/api/v1/auth/password-reset",
    "/api/v1/auth/callback",
  ].includes(path);
  if (response.status === 401 && retry && !isAuthEntry && await refreshSession()) {
    return apiFetch(path, init, false);
  }
  return response;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  let result: { detail?: string };
  try {
    result = await response.json() as { detail?: string };
  } catch {
    if (response.ok) throw new Error("Backend ส่งข้อมูลตอบกลับที่ไม่ถูกต้อง");
    result = {};
  }
  if (!response.ok) {
    const detail = result.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg || "ข้อมูลไม่ถูกต้อง").join(" · ")
      : typeof detail === "string" ? detail : `คำขอไม่สำเร็จ (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return result as T;
}

export async function login(email: string, password: string) {
  const result = await apiJson<{ user: ApiUser }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}

export async function signUp(email: string, password: string, username: string) {
  return apiJson<{ user: ApiUser; authenticated: boolean }>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, username }),
  });
}

export async function requestPasswordReset(email: string) {
  return apiJson<{ status: string }>("/api/v1/auth/password-reset", {
    method: "POST",
    body: JSON.stringify({ email, redirect_to: window.location.origin }),
  });
}

export async function acceptAuthCallback(accessToken: string, refreshToken: string, expiresIn?: number) {
  return apiJson<{ status: string }>("/api/v1/auth/callback", {
    method: "POST",
    body: JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    }),
  });
}

export async function updatePassword(password: string) {
  return apiJson<{ status: string }>("/api/v1/auth/password", {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

export async function signOut() {
  await apiJson<{ status: string }>("/api/v1/auth/logout", { method: "POST" });
}
