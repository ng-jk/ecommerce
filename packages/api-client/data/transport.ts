import { z } from "zod";
import {
  ApiError,
  type FailureKind,
  type ShopSlug,
  type StoragePort,
} from "../domain/types";
import { accepted, errorBody, operation } from "./schemas";
export type TransportOptions = {
  shop: ShopSlug;
  origin: string;
  native: boolean;
  getToken(): Promise<string | null>;
  randomUUID(): string;
  storage: StoragePort;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  digest?: (value: string) => Promise<string>;
};
export async function digestIdentity(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function classify(status: number): FailureKind {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "missing";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "throttled";
  if (status === 408) return "timeout";
  return status >= 500 ? "server" : "unexpected";
}
export function responseError(status: number, body: unknown): ApiError {
  const parsed = errorBody.safeParse(body);
  const fields = parsed.success ? (parsed.data.validation_error ?? {}) : {};
  const message =
    Object.values(fields).flat().join("\n") ||
    (parsed.success ? parsed.data.message : null) ||
    "The request could not complete.";
  return new ApiError(message, status, classify(status), fields);
}
export function retryDelay(
  attempt: number,
  retryAfter: string | null,
  now = Date.now(),
  random = Math.random(),
): number {
  const numeric = Number(retryAfter);
  const specified =
    retryAfter === null
      ? 0
      : Number.isFinite(numeric)
        ? numeric * 1000
        : Date.parse(retryAfter) - now;
  return Math.min(
    5000,
    Math.max(
      0,
      Number.isFinite(specified) ? specified : 0,
      200 * 2 ** attempt + random * 100,
    ),
  );
}
export function createTransport(options: TransportOptions) {
  const base = options.origin.replace(/\/$/, "");
  if (base) {
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new ApiError("Invalid API origin.", 0, "validation");
    }
    const local =
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      url.hostname === "127.0.0.1" ||
      /^10\.\d+\.\d+\.\d+$/.test(url.hostname) ||
      /^192\.168\.\d+\.\d+$/.test(url.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && local))
    )
      throw new ApiError(
        "HTTPS is required outside local development.",
        0,
        "validation",
      );
  }
  const fetcher = options.fetch ?? fetch;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  async function headers(method: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (options.native) {
      const token = await options.getToken();
      if (token) result.Authorization = `Bearer ${token}`;
    } else if (method !== "GET") {
      const response = await fetcher(`${base}/sanctum/csrf-cookie`, {
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw responseError(response.status, null);
      const cookie =
        typeof document === "undefined"
          ? undefined
          : document.cookie
              .split("; ")
              .find((value) => value.startsWith("XSRF-TOKEN="));
      if (cookie) result["X-XSRF-TOKEN"] = decodeURIComponent(cookie.slice(11));
    }
    return result;
  }
  async function send(
    url: string,
    init: RequestInit,
    retry: boolean,
  ): Promise<{ status: number; body: unknown }> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetcher(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (
          retry &&
          attempt < 2 &&
          [408, 429, 500, 502, 503, 504].includes(response.status)
        ) {
          await sleep(retryDelay(attempt, response.headers.get("Retry-After")));
          continue;
        }
        if (response.status === 204) return { status: 204, body: undefined };
        if (response.status === 304)
          throw new ApiError(
            "The server returned an unsupported cache response.",
            304,
            "invalid_body",
          );
        if (!response.headers.get("Content-Type")?.includes("application/json"))
          throw new ApiError(
            "Expected a JSON response.",
            response.status,
            "invalid_body",
          );
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new ApiError(
            "Invalid JSON response.",
            response.status,
            "invalid_body",
          );
        }
        if (!response.ok) throw responseError(response.status, body);
        return { status: response.status, body };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (retry && attempt < 2) {
          await sleep(retryDelay(attempt, null));
          continue;
        }
        throw new ApiError(
          "Could not reach the shop. Please retry.",
          0,
          error instanceof Error && error.name === "TimeoutError"
            ? "timeout"
            : "network",
        );
      }
    }
  }
  return async function request<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    method = "GET",
    body?: unknown,
    operationReceipt?: string,
    pendingStorage = options.storage,
  ): Promise<T> {
    const auth = path === "auth/me";
    const fingerprint = JSON.stringify([
      options.shop,
      path,
      method,
      body,
      ...(operationReceipt ? [operationReceipt] : []),
    ]);
    let storageKey = "";
    let key = options.randomUUID();
    let receipt =
      operationReceipt ??
      (options.randomUUID() + options.randomUUID()).replaceAll("-", "");
    if (!path.startsWith("auth/") && method !== "GET") {
      try {
        storageKey = `pending.${await (options.digest ?? digestIdentity)(fingerprint)}`;
        const previous = await pendingStorage.get(storageKey);
        if (previous) {
          const record = z
            .object({ key: z.string().uuid(), receipt: z.string().length(64) })
            .parse(JSON.parse(previous));
          key = record.key;
          receipt = record.receipt;
        } else
          await pendingStorage.set(
            storageKey,
            JSON.stringify({ key, receipt }),
          );
      } catch {
        throw new ApiError(
          "Cannot safely persist this action. Restore local storage before retrying.",
          0,
          "invalid_body",
        );
      }
    }
    const requestHeaders = {
      ...(await headers(method)),
      "Idempotency-Key": key,
      "X-Operation-Token": receipt,
    };
    const init: RequestInit = {
      method,
      headers: requestHeaders,
      credentials: options.native ? "omit" : "include",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let response = await send(
      `${base}/api/v1/shops/${options.shop}/${path}`,
      init,
      !auth || method === "GET",
    );
    if (response.status === 202) {
      const submission = accepted.safeParse(response.body);
      if (
        !submission.success ||
        submission.data.poll_url !==
          `/api/v1/shops/${options.shop}/operations/${submission.data.operation_id}`
      )
        throw new ApiError("Invalid operation receipt.", 202, "invalid_body");
      let completed = false;
      for (let poll = 0; poll < 60; poll++) {
        await sleep(Math.min(1000, 100 + poll * 50));
        response = await send(
          base + submission.data.poll_url,
          {
            method: "GET",
            headers: requestHeaders,
            credentials: options.native ? "omit" : "include",
          },
          true,
        );
        const result = operation.safeParse(response.body);
        if (
          !result.success ||
          result.data.operation_id !== submission.data.operation_id
        )
          throw new ApiError(
            "Invalid operation response.",
            200,
            "invalid_body",
          );
        if (
          result.data.status === "queued" ||
          result.data.status === "processing"
        )
          continue;
        if (result.data.status !== "succeeded") {
          await pendingStorage.remove(storageKey).catch(() => undefined);
          throw responseError(
            result.data.http_status ?? 500,
            result.data.result,
          );
        }
        response = {
          status: result.data.http_status ?? 200,
          body: result.data.result,
        };
        completed = true;
        break;
      }
      if (!completed)
        throw new ApiError(
          "Your action is still pending. Retry to resume it.",
          202,
          "timeout",
        );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success)
      throw new ApiError(
        "The response does not match the API contract.",
        response.status,
        "invalid_body",
      );
    await pendingStorage.remove(storageKey).catch(() => undefined);
    return parsed.data;
  };
}
