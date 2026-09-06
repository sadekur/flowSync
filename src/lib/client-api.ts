const API_URL = process.env.NEXT_PUBLIC_API_URL as string;

export interface ApiValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  issues?: ApiValidationIssue[];

  constructor(status: number, message: string, issues?: ApiValidationIssue[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const value = match?.[1];
  return value !== undefined ? decodeURIComponent(value) : undefined;
}

// Browser-only: talks to the Express API directly with the real auth
// cookies (credentials: "include") and echoes the CSRF cookie back as a
// header on mutations, per the double-submit check in middleware/csrf.ts.
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = readCookie("csrfToken");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Request failed", data.issues);
  }

  return data as T;
}
