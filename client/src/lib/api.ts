import type { ApiResponse } from "@shared/types";
import { z } from "zod";

const API_URL = (import.meta.env.VITE_BASE_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
type TokenGetter = (skipCache?: boolean) => Promise<string | null>;
const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

// API errors use RFC 7807 problem details. Older server builds also included a
// `success: false` field, so accept both shapes and preserve the useful error.
const errorEnvelopeSchema = z.object({
  success: z.literal(false).optional(),
  message: z.string().optional(),
  detail: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
}).passthrough();

let getAccessToken: TokenGetter = async () => null;

export function setApiTokenGetter(getter: TokenGetter) {
  getAccessToken = getter;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  validationErrors?: unknown[];
  constructor(message: string, status: number, code?: string, requestId?: string, validationErrors?: unknown[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.validationErrors = validationErrors;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  const send = async (skipTokenCache = false) => {
    const token = await getAccessToken(skipTokenCache);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  };

  let response = await send();
  // Clerk tokens can expire or be momentarily unavailable while a session is
  // restored. Refresh the token and retry the rejected request exactly once.
  if (response.status === 401) response = await send(true);
  const rawBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(rawBody);
    if (parsedError.success) {
      const body = parsedError.data;
      throw new ApiError(body.detail ?? body.message ?? "Request failed", response.status, body.code, body.requestId, body.errors);
    }
    throw new ApiError("The server returned an unreadable error response", response.status || 502, "INVALID_RESPONSE");
  }

  const parsedEnvelope = successEnvelopeSchema.safeParse(rawBody);
  if (!parsedEnvelope.success) throw new ApiError("The server returned an invalid response", response.status || 502, "INVALID_RESPONSE");
  const body = parsedEnvelope.data as ApiResponse<T>;
  return schema ? schema.parse(body.data) : body.data as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init),
  post: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  uploadPart: (path: string, data: Blob) => apiFetch<{ ETag: string }>(path, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: data }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
