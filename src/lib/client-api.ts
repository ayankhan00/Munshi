"use client";

export class ClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiOptions = Omit<RequestInit, "cache"> & {
  skipAuthRedirect?: boolean;
  /** Set to false to always hit the network (GET only). Defaults to true. */
  cache?: boolean;
};

type CacheEntry = { data: unknown; expires: number };

const MEM_TTL = 60_000;
const PERSIST_TTL = 30 * 24 * 60 * 60 * 1000;
const PERSIST_KEY = "munshi:cache:v1";

/** GET resources that change rarely and are safe to persist across reloads. */
const PERSIST_PREFIXES = ["/api/categories"];

const mem = new Map<string, CacheEntry>();

function cacheKey(path: string): string {
  return `GET:${path}`;
}

function isPersistable(path: string): boolean {
  return PERSIST_PREFIXES.some((p) => path === p || path.startsWith(`${p}?`));
}

function readPersist(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writePersist(store: Record<string, CacheEntry>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private-mode failures
  }
}

function readCache<T>(path: string): T | undefined {
  const key = cacheKey(path);
  const now = Date.now();

  const inMem = mem.get(key);
  if (inMem) {
    if (inMem.expires > now) return inMem.data as T;
    mem.delete(key);
  }

  if (isPersistable(path)) {
    const entry = readPersist()[key];
    if (entry && entry.expires > now) {
      mem.set(key, entry);
      return entry.data as T;
    }
  }

  return undefined;
}

function writeCache(path: string, data: unknown): void {
  const key = cacheKey(path);
  const now = Date.now();
  mem.set(key, { data, expires: now + MEM_TTL });

  if (isPersistable(path)) {
    const store = readPersist();
    store[key] = { data, expires: now + PERSIST_TTL };
    writePersist(store);
  }
}

/** Clears cached GET responses. Pass a prefix to clear only matching entries. */
export function clearCache(prefix?: string): void {
  if (!prefix) {
    mem.clear();
    writePersist({});
    return;
  }
  for (const key of [...mem.keys()]) {
    if (key.includes(prefix)) mem.delete(key);
  }
  const store = readPersist();
  for (const key of Object.keys(store)) {
    if (key.includes(prefix)) delete store[key];
  }
  writePersist(store);
}

function invalidateFor(path: string): void {
  // Any write may change volatile data (balances, reports, lists) -> drop memory.
  mem.clear();
  // A change of identity (login/register/logout/reset) invalidates everything,
  // including persisted reference data, so one user never sees another's cache.
  if (path.startsWith("/api/auth/")) {
    clearCache();
    return;
  }
  // Persisted reference data is only dropped when its own resource is written.
  if (isPersistable(path)) clearCache(path);
}

export async function api<T = unknown>(
  path: string,
  init?: ApiOptions,
): Promise<T> {
  const { skipAuthRedirect, cache = true, ...requestInit } = init ?? {};
  const method = (requestInit.method ?? "GET").toUpperCase();
  const isGet = method === "GET";

  if (isGet && cache) {
    const cached = readCache<T>(path);
    if (cached !== undefined) return cached;
  }

  const res = await fetch(path, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...(requestInit.headers ?? {}),
    },
  });
  if (res.status === 401 && !skipAuthRedirect) {
    clearCache();
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

  const data =
    body && typeof body === "object" && "data" in body ? (body.data as T) : (body as T);

  if (isGet && cache) {
    writeCache(path, data);
  } else if (!isGet) {
    invalidateFor(path);
  }

  return data;
}

export function formatMoney(minor: number, currency = "PKR"): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
