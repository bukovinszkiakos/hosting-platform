import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, isDeploymentActive, setUnauthorizedHandler } from "@/services/api";

// Minimal stand-in for a fetch Response, shaped to what apiFetch/toApiError read
// (ok, status, statusText, json(), text()). Avoids depending on a real Response
// implementation being present in the test environment.
function fakeResponse(init: {
  status: number;
  statusText?: string;
  jsonBody?: unknown;
  textBody?: string;
  jsonThrows?: boolean;
}): Response {
  const { status, statusText = "", jsonBody, textBody, jsonThrows } = init;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => {
      if (jsonThrows) throw new Error("not json");
      return jsonBody;
    },
    text: async () => textBody ?? (jsonBody !== undefined ? JSON.stringify(jsonBody) : ""),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("isDeploymentActive", () => {
  it("is true only for non-terminal statuses", () => {
    expect(isDeploymentActive("Pending")).toBe(true);
    expect(isDeploymentActive("Building")).toBe(true);
    expect(isDeploymentActive("Deploying")).toBe(true);
  });

  it("is false for terminal or unknown statuses", () => {
    expect(isDeploymentActive("Online")).toBe(false);
    expect(isDeploymentActive("Failed")).toBe(false);
    expect(isDeploymentActive("Draft")).toBe(false);
    expect(isDeploymentActive("")).toBe(false);
  });
});

describe("apiFetch (via api client)", () => {
  it("performs a GET that includes credentials and parses the JSON body", async () => {
    const user = { id: "1", displayName: "Ada", email: "ada@example.com", role: "User" };
    fetchMock.mockResolvedValue(fakeResponse({ status: 200, jsonBody: user }));

    const result = await api.auth.me();

    expect(result).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/me");
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");
    // No request body -> no Content-Type header is set.
    expect(options.headers).not.toHaveProperty("Content-Type");
  });

  it("serializes the body and sets Content-Type for requests with a payload", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 200, jsonBody: { message: "ok" } }));

    await api.auth.login({ email: "ada@example.com", password: "secret" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(
      JSON.stringify({ email: "ada@example.com", password: "secret" }),
    );
  });

  it("returns undefined for a 204 No Content response", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 204 }));

    const result = await api.profile.update({ displayName: "Ada", email: "ada@example.com" });

    expect(result).toBeUndefined();
  });

  it("throws an ApiError carrying the status, message and errors from the body", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({
        status: 400,
        jsonBody: { message: "Validation failed", errors: ["Name is required"] },
      }),
    );

    const error = await api.projects.create({ name: "", repositoryUrl: "" }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("Validation failed");
    expect(error.errors).toEqual(["Name is required"]);
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ status: 500, statusText: "Internal Server Error", jsonThrows: true }),
    );

    const error = await api.dashboard.get().catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(error.message).toBe("Internal Server Error");
    expect(error.errors).toEqual([]);
  });

  it("invokes the unauthorized handler on a 401 and still throws", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ status: 401, jsonBody: { message: "Unauthorized", errors: [] } }),
    );
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    const error = await api.auth.me().catch((e) => e);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
  });
});
