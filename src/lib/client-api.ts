"use client";

export class ClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiOptions = RequestInit & { skipAuthRedirect?: boolean };

export async function api<T = unknown>(
  path: string,
  init?: ApiOptions,
): Promise<T> {
  const { skipAuthRedirect, ...requestInit } = init ?? {};
  const res = await fetch(path, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...(requestInit.headers ?? {}),
    },
  });
  if (res.status === 401 && !skipAuthRedirect) {
    window.location.href = "/login";
    throw new ClientError(401, "You must be signed in.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed") || "Request failed";
    throw new ClientError(res.status, message);
  }
  if (body && typeof body === "object" && "data" in body) {
    return body.data as T;
  }
  return body as T;
}

export function formatMoney(minor: number, currency = "PKR"): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}