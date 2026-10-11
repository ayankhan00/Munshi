"use client";

export type PushStatus =
  | "unsupported"
  | "unconfigured"
  | "default"
  | "granted"
  | "denied"
  | "subscribed";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function vapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export function pushConfigured(): boolean {
  return vapidPublicKey().length > 0;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (!pushConfigured()) return "unconfigured";
  if (Notification.permission === "denied") return "denied";

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) return "subscribed";
  return Notification.permission === "granted" ? "granted" : "default";
}

export async function enablePush(): Promise<{ ok: boolean; error?: string; status: PushStatus }> {
  if (!pushSupported()) {
    return { ok: false, error: "Push notifications aren't supported in this browser.", status: "unsupported" };
  }
  const key = vapidPublicKey();
  if (!key) {
    return { ok: false, error: "Push is not configured on the server.", status: "unconfigured" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      error: "Notification permission was not granted.",
      status: permission === "denied" ? "denied" : "default",
    };
  }

  if (!(await navigator.serviceWorker.getRegistration())) {
    await registerServiceWorker();
  }
  const reg = await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));

  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.error ?? "Failed to save subscription.", status: "granted" };
  }
  return { ok: true, status: "subscribed" };
}

export async function disablePush(): Promise<{ ok: boolean }> {
  if (!pushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;

  let endpoint: string | undefined;
  if (sub) {
    endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
  }

  await fetch("/api/notifications/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  }).catch(() => {});

  return { ok: true };
}
