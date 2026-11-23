export function env(): Record<string, string> {
  const v = process.env;
  return {
    sessionCookieName: v.SESSION_COOKIE_NAME ?? "pa_session",
    geminiApiKey: v.GEMINI_API_KEY ?? "",
    geminiModel: v.GEMINI_MODEL ?? "gemini-flash-lite-latest",
    cronSecret: v.CRON_SECRET ?? "",
    vapidPublicKey: v.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: v.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: v.VAPID_SUBJECT ?? "",
  };
}