/**
 * Unit tests for the API client — mocks fetch to avoid network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, api } from "../api/client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ApiError", () => {
  it("stores status and message", () => {
    const err = new ApiError("Not found", 404);
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ApiError");
    expect(err instanceof Error).toBe(true);
  });
});

describe("api.get", () => {
  it("returns parsed JSON on 200", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    const result = await api.get<{ ok: boolean }>("/api/health");
    expect(result.ok).toBe(true);
  });

  it("throws ApiError with body.error on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: "Not found" }, 404));
    await expect(api.get("/api/missing")).rejects.toMatchObject({
      status: 404,
      message: "Not found",
    });
  });

  it("includes Authorization header when token is provided", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ data: 1 }));
    await api.get("/api/secure", "my-token");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-token");
  });

  it("does not include Authorization header when no token", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ data: 1 }));
    await api.get("/api/open");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });
});

describe("api.post", () => {
  it("sends JSON body and returns parsed response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: "abc" }, 201));
    const result = await api.post<{ id: string }>("/api/items", { name: "test" });
    expect(result.id).toBe("abc");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "test" }));
  });
});
