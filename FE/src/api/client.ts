const BASE = import.meta.env.VITE_API_URL ?? "";

/** Thrown on non-OK responses so callers can handle 401 (expired token) vs other errors. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: { error?: string } | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    throw new ApiError(data?.error ?? res.statusText ?? "Request failed", res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string) =>
    request<T>(path, { method: "GET", token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),
  delete: (path: string, token?: string) =>
    request<void>(path, { method: "DELETE", token }),
};
