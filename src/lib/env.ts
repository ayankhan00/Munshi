export function env(): Record<string, string> {
  const v = process.env;
  return {
    databaseUrl: v.DATABASE_URL ?? "file:./dev.db",
    sessionSecret: v.SESSION_SECRET ?? "",
    sessionCookieName: v.SESSION_COOKIE_NAME ?? "pa_session",
    geminiApiKey: v.GEMINI_API_KEY ?? "",
    geminiModel: v.GEMINI_MODEL ?? "gemini-1.5-flash",
    cronSecret: v.CRON_SECRET ?? "",
    vapidPublicKey: v.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: v.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: v.VAPID_SUBJECT ?? "",
    appUrl: v.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    defaultTz: v.DEFAULT_TIMEZONE ?? "Asia/Karachi",
  };
}