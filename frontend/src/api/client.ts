import type { ApiError, ApiErrorCode, BackendErrorBody } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackendErrorBody(value: unknown): value is BackendErrorBody {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  return true;
}

function toApiErrorCode(value: unknown, status: number): ApiErrorCode {
  if (
    value === "already_reserved" ||
    value === "listing_not_found" ||
    value === "listing_not_reservable" ||
    value === "idempotency_key_conflict" ||
    value === "validation_error"
  ) {
    return value;
  }
  if (status >= 500) {
    return "server_error";
  }
  return "unknown_error";
}

function fallbackMessage(code: ApiErrorCode): string {
  switch (code) {
    case "already_reserved":
      return "Listing was reserved by someone else.";
    case "listing_not_reservable":
      return "Listing is no longer reservable.";
    case "listing_not_found":
      return "Listing was not found.";
    case "idempotency_key_conflict":
      return "Reserve request key was reused for a different request.";
    case "network_error":
      return "Network request failed.";
    case "server_error":
      return "Temporary service issue.";
    case "validation_error":
      return "Request validation failed.";
    case "unknown_error":
      return "Request failed.";
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

export function normalizeApiError(status: number, body: unknown): ApiError {
  if (isBackendErrorBody(body)) {
    const code = toApiErrorCode(body.error.code, status);
    return {
      code,
      message: body.error.message ?? fallbackMessage(code),
      details: body.error.details ?? {},
      status,
      transient: status >= 500,
    };
  }

  const code = status >= 500 ? "server_error" : "unknown_error";
  return {
    code,
    message: fallbackMessage(code),
    details: {},
    status,
    transient: status >= 500,
  };
}

export function normalizeUnknownError(error: unknown): ApiError {
  if (isRecord(error) && typeof error.code === "string") {
    const code = toApiErrorCode(error.code, Number(error.status ?? 0));
    return {
      code,
      message: typeof error.message === "string" ? error.message : fallbackMessage(code),
      details: isRecord(error.details) ? error.details : {},
      status: typeof error.status === "number" ? error.status : undefined,
      transient: Boolean(error.transient),
    };
  }

  return {
    code: "network_error",
    message: fallbackMessage("network_error"),
    details: {},
    transient: true,
  };
}

export async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await parseJson(response);

    if (!response.ok) {
      throw normalizeApiError(response.status, body);
    }

    return body as TResponse;
  } catch (error) {
    if (isRecord(error) && typeof error.code === "string") {
      throw error;
    }
    throw normalizeUnknownError(error);
  }
}

